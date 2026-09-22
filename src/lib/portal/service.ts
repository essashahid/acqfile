import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { sha256 } from "@/lib/hash";
import { buildIndex } from "@/lib/deliverables/index-build";
import { requireWorkspace, type SessionContext } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { scrubPayload } from "@/lib/deals/identifiers";
import { mapDeal, personHome, type ResponseRow } from "./map";
export const today = () => new Date().toISOString().slice(0, 10);
export async function adviserContext() {
  const ctx = await requireWorkspace();
  if (ctx.isPublic) redirect("/login");
  if (ctx.workspace.role === "viewer") redirect("/staff/deals");
  return ctx;
}
/** Only called after an audience-specific authorization check. Existing domain functions
 * keep their operator role requirement; the actor remains the authenticated adviser/issuer. */
export const domainContext = (ctx: SessionContext): SessionContext => ({
  ...ctx,
  workspace: { ...ctx.workspace, role: "reviewer" },
});
export async function portalData(dealId: string) {
  const built = await buildIndex(dealId);
  const submittedSegments = await getDb()
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  const data = { ...built, submittedSegments };
  const responses = await getDb()
    .select()
    .from(schema.portalResponses)
    .where(eq(schema.portalResponses.dealId, dealId))
    .orderBy(schema.portalResponses.createdAt);
  const [workspace] = await getDb()
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, data.deal.workspaceId));
  return { data, responses, workspace: workspace!, mapped: mapDeal(data, responses) };
}
export async function resolvePortal(token: string, visit = true) {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return null;
  const db = getDb();
  const [link] = await db
    .select()
    .from(schema.portalLinks)
    .where(
      and(
        eq(schema.portalLinks.tokenHash, sha256(Buffer.from(token))),
        isNull(schema.portalLinks.revoked),
      ),
    );
  if (!link) return null;
  const [party] = await db
    .select()
    .from(schema.parties)
    .where(and(eq(schema.parties.id, link.partyId), eq(schema.parties.dealId, link.dealId)));
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, link.dealId));
  const [issuer] = await db
    .select()
    .from(schema.appUsers)
    .where(eq(schema.appUsers.id, link.createdBy));
  if (!party || !deal || !issuer) return null;
  const [member] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.userId, issuer.id),
        eq(schema.workspaceMembers.workspaceId, deal.workspaceId),
      ),
    );
  if (!member || !["admin", "reviewer", "adviser"].includes(member.role)) return null;
  if (visit && link.lastSeen !== today())
    await db
      .update(schema.portalLinks)
      .set({ lastSeen: today() })
      .where(eq(schema.portalLinks.id, link.id));
  const ctx: SessionContext = {
    user: { id: issuer.id, email: issuer.email, displayName: issuer.displayName },
    workspace: { workspaceId: deal.workspaceId, slug: "", name: "", role: "reviewer" },
  };
  return { link, party, deal, ctx, firstVisit: !link.lastSeen };
}
export type PortalAccess = NonNullable<Awaited<ReturnType<typeof resolvePortal>>>;
export async function requirePortal(token: string, visit = true) {
  const p = await resolvePortal(token, visit);
  if (!p) notFound();
  return p;
}
export async function recipientData(token: string, visit = true) {
  const access = await requirePortal(token, visit),
    all = await portalData(access.deal.id);
  return {
    ...all,
    ...access,
    home: personHome(all.mapped, access.party.id, access.party.legalName),
  };
}
export async function createPortalLink(ctx: SessionContext, dealId: string, partyId: string) {
  if (ctx.isPublic || !["admin", "reviewer", "adviser"].includes(ctx.workspace.role))
    throw Error("Access denied");
  await requireDeal(ctx, dealId);
  const [party] = await getDb()
    .select()
    .from(schema.parties)
    .where(and(eq(schema.parties.id, partyId), eq(schema.parties.dealId, dealId)));
  if (!party) throw Error("Person not found");
  const token = randomBytes(48).toString("base64url");
  await getDb().transaction(async (tx) => {
    await tx
      .update(schema.portalLinks)
      .set({ revoked: today() })
      .where(
        and(
          eq(schema.portalLinks.dealId, dealId),
          eq(schema.portalLinks.partyId, partyId),
          isNull(schema.portalLinks.revoked),
        ),
      );
    const [link] = await tx
      .insert(schema.portalLinks)
      .values({
        dealId,
        partyId,
        tokenHash: sha256(Buffer.from(token)),
        createdBy: ctx.user.id,
        created: today(),
      })
      .returning();
    await tx.insert(schema.events).values({
      dealId,
      actorId: ctx.user.id,
      action: "portal_link_created",
      entityType: "portal_link",
      entityId: link!.id,
      maskedAfter: { partyId },
    });
  });
  return token;
}
export async function revokePortalLink(ctx: SessionContext, dealId: string, partyId: string) {
  if (ctx.isPublic || !["admin", "reviewer", "adviser"].includes(ctx.workspace.role))
    throw Error("Access denied");
  await requireDeal(ctx, dealId);
  await getDb().transaction(async (tx) => {
    const links = await tx
      .update(schema.portalLinks)
      .set({ revoked: today() })
      .where(
        and(
          eq(schema.portalLinks.dealId, dealId),
          eq(schema.portalLinks.partyId, partyId),
          isNull(schema.portalLinks.revoked),
        ),
      )
      .returning();
    for (const link of links)
      await tx.insert(schema.events).values({
        dealId,
        actorId: ctx.user.id,
        action: "portal_link_revoked",
        entityType: "portal_link",
        entityId: link.id,
        maskedAfter: { partyId },
      });
  });
}
export async function recordResponse(
  ctx: SessionContext,
  dealId: string,
  partyId: string | null,
  taskKey: string,
  kind: string,
  payload: Record<string, unknown>,
  linkId: string | null = null,
) {
  await requireDeal(ctx, dealId);
  return getDb().transaction(async (tx) => {
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: ctx.user.id,
        action: `portal_${kind}`,
        entityType: "deal",
        entityId: dealId,
        maskedAfter: scrubPayload({ partyId, linkId, taskKey, ...payload }),
      })
      .returning();
    const [response] = await tx
      .insert(schema.portalResponses)
      .values({
        dealId,
        partyId,
        linkId,
        taskKey,
        kind,
        payload: scrubPayload(payload),
        auditEventId: event!.id,
      })
      .returning();
    return response!;
  });
}
export async function tellUs(access: PortalAccess, key: string, raw: unknown) {
  const input = z
    .object({
      reason: z.enum(["later", "already", "not_applicable"]),
      date: z.iso.date().optional(),
      note: z.string().max(2000).default(""),
    })
    .parse(raw);
  if (input.reason === "later" && !input.date) throw Error("Please choose a date.");
  const all = await portalData(access.deal.id);
  if (!all.mapped.tasks.some((t) => t.key === key && t.partyId === access.party.id))
    throw Error("Task not found");
  return recordResponse(
    access.ctx,
    access.deal.id,
    access.party.id,
    key,
    "cant_send",
    input,
    access.link.id,
  );
}
export async function answerQuestion(
  ctx: SessionContext,
  dealId: string,
  key: string,
  choice: string,
  note: string,
  evidenceKey: string,
  access?: PortalAccess,
) {
  await requireDeal(ctx, dealId);
  return getDb().transaction(async (tx) => {
    // Filing and fact review use this deal lock too. The page's evidence key is
    // checked after the lock, so a simultaneous replacement cannot take its answer.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`);
    const { mapped } = await portalData(dealId),
      q = mapped.questions.find((q) => q.key === key);
    if (!q) throw Error("Please refresh this question. The details have changed.");
    if (access && q.partyId !== access.party.id) throw Error("Question not found");
    if (!evidenceKey || q.evidenceKey !== evidenceKey || q.answered)
      throw Error("Please refresh this question. The documents or answer have changed.");
    if (q.kind === "staff_review") throw Error("Please ask your adviser to review this question.");
    if (
      (q.kind === "choice" &&
        !q.values.includes(choice) &&
        !["neither", "unsure"].includes(choice)) ||
      (q.kind === "clarification" && !["clarification", "unsure"].includes(choice))
    )
      throw Error("Please choose one of the answers.");
    const cleanNote = z.string().trim().max(2000).parse(note);
    if (q.kind === "clarification" && choice === "clarification" && !cleanNote)
      throw Error("Please explain these details before sending your answer.");
    const payload = { choice, note: cleanNote, evidenceKey };
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: ctx.user.id,
        action: "portal_answer",
        entityType: "deal",
        entityId: dealId,
        maskedAfter: scrubPayload({
          partyId: q.partyId,
          linkId: access?.link.id ?? null,
          taskKey: key,
          ...payload,
        }),
      })
      .returning();
    const [response] = await tx
      .insert(schema.portalResponses)
      .values({
        dealId,
        partyId: q.partyId,
        linkId: access?.link.id ?? null,
        taskKey: key,
        kind: "answer",
        payload: scrubPayload(payload),
        auditEventId: event!.id,
      })
      .returning();
    return response!;
  });
}
export function ownTask(rows: ReturnType<typeof mapDeal>, partyId: string, key: string) {
  const task = rows.tasks.find((t) => t.key === key && t.partyId === partyId);
  if (!task) throw Error("Task not found");
  return task;
}
export async function mayOpenOriginal(access: PortalAccess, versionId: string) {
  const all = await portalData(access.deal.id);
  const segments = await getDb()
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.dealId, access.deal.id),
        eq(schema.segments.documentVersionId, versionId),
      ),
    );
  // A mixed-party physical bundle cannot be disclosed through one person's token.
  if (segments.some((s) => s.partyId !== access.party.id)) return false;
  const own = all.mapped.tasks.filter((t) => t.partyId === access.party.id);
  return (
    own.some((t) => t.versions.includes(versionId)) &&
    all.data.versions.some((v) => v.id === versionId)
  );
}
export function latestReminder(responses: ResponseRow[], partyId: string) {
  return responses.filter((r) => r.kind === "reminder_sent" && r.partyId === partyId).at(-1)
    ?.createdAt;
}

export async function keepDocument(access: PortalAccess, key: string) {
  const all = await portalData(access.deal.id);
  ownTask(all.mapped, access.party.id, key);
  const upload = all.responses
    .filter((r) => r.kind === "upload" && r.partyId === access.party.id && r.taskKey === key)
    .at(-1);
  if (!upload) throw Error("Document not found");
  const response = await recordResponse(
    access.ctx,
    access.deal.id,
    access.party.id,
    key,
    "keep_document",
    { uploadId: upload.id },
    access.link.id,
  );
  for (const version of upload.payload.versions as string[])
    await getDb()
      .insert(schema.intakeReviews)
      .values({
        dealId: access.deal.id,
        documentVersionId: version,
        type: "classification",
        reason: "The sender asks the team to check whether this is the document needed.",
      })
      .onConflictDoNothing();
  return response;
}
