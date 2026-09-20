import { scrubPayload } from "@/lib/deals/identifiers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import type { SessionContext } from "@/lib/workspace";
import { buildIndex } from "./index-build";

type Finding = typeof schema.findings.$inferSelect;
type Detail = {
  fact_id: string | null;
  value: unknown;
  file: string;
  page: number | null;
  quote: string;
};
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/**
 * A49: one deterministic draft per responsible party. A conflict shows both values with their file
 * and page and asks which is correct. Nothing states which side is right and nothing is ever sent.
 */
export function draftBody(
  deal: { code: string; name: string },
  responsible: string,
  findings: Finding[],
  fileOf: (id: string) => string,
  partyOf: (id: string) => string = (id) => id,
) {
  const lines = [
    `Document request for ${deal.code} · ${deal.name}`,
    `Responsible party: ${responsible}`,
    "",
    "We are preparing the loan file from the documents supplied so far. The items below are outstanding. Please reply with the documents or the correction.",
    "",
  ];
  let n = 0;
  for (const f of findings) {
    n++;
    const details = (f.detailsJson as { message: string; details: Detail[] }) ?? {
      message: "",
      details: [],
    };
    lines.push(
      `${n}. ${details.message || f.ruleId} (${partyOf(f.scopeKey)}, ${f.period ?? "no period"}; ${f.type}, ${f.severity})`,
    );
    const cited = details.details;
    if (f.type === "conflict" && cited.length > 1) {
      lines.push(
        "   The supplied documents give different values. Please tell us which is correct.",
      );
      for (const d of cited)
        lines.push(`   - ${show(d.value)} — ${fileOf(d.file)}, page ${d.page}: "${d.quote}"`);
    } else {
      for (const d of cited.slice(0, 3))
        lines.push(`   - ${fileOf(d.file)}, page ${d.page}: "${d.quote}"`);
    }
    lines.push("");
  }
  lines.push(
    "Prepared from documents supplied by the parties. Flags are preparation aids for lender review. They are not credit, legal, tax or eligibility determinations.",
  );
  return scrubPayload(lines.join("\n"));
}

/** Rebuild one draft per responsible party from the currently open findings. */
export async function buildDrafts(context: SessionContext, dealId: string) {
  await requireDeal(context, dealId);
  const { deal, findings, versions, originalPath, partyName, rules } = await buildIndex(dealId);
  const fileOf = (versionId: string) =>
    versions.some((v) => v.id === versionId) ? originalPath(versionId) : versionId;
  const open = findings
    .filter((f) => f.status === "open")
    .sort((a, b) => a.findingKey.localeCompare(b.findingKey));
  const recipient = (f: Finding) => {
    const rule = rules.get(f.ruleId);
    return rule?.scope.startsWith("per_")
      ? `${f.responsibleRole} · ${partyName(f.scopeKey)}`
      : f.responsibleRole;
  };
  const parties = [...new Set(open.map(recipient))].sort();
  return parties.map((responsible) => {
    const mine = open.filter((f) => recipient(f) === responsible);
    return {
      responsible,
      findingKeys: mine.map((f) => f.findingKey),
      body: draftBody(deal, responsible, mine, fileOf, partyName),
    };
  });
}

/** Mark as sent: persist the draft, move its findings to requested, and start aging. Nothing is sent by the system. */
export async function markRequestSent(
  context: SessionContext,
  dealId: string,
  responsible: string,
) {
  await assertMutation(context, "deal-request");
  await requireDeal(context, dealId);
  const drafts = await buildDrafts(context, dealId);
  const draft = drafts.find((d) => d.responsible === responsible);
  if (!draft || !draft.findingKeys.length) throw Error("No open findings for that party");
  const db = getDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    const [request] = await tx
      .insert(schema.requests)
      .values({
        dealId,
        responsible,
        body: draft.body,
        findingKeys: draft.findingKeys,
        status: "sent",
        sentAt: now,
        actorId: context.user.id,
      })
      .returning();
    for (const key of draft.findingKeys)
      await tx
        .update(schema.findings)
        .set({ status: "requested", requestId: request!.id, requestedAt: now })
        .where(and(eq(schema.findings.dealId, dealId), eq(schema.findings.findingKey, key)));
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "request_marked_sent",
      entityType: "request",
      entityId: request!.id,
      maskedAfter: { responsible, findings: draft.findingKeys.length },
    });
    return request!;
  });
}

export async function listRequests(dealId: string) {
  return getDb()
    .select()
    .from(schema.requests)
    .where(eq(schema.requests.dealId, dealId))
    .orderBy(schema.requests.createdAt);
}

export const ageInDays = (sentAt: Date | null, now = new Date()) =>
  sentAt ? Math.floor((now.getTime() - sentAt.getTime()) / 86400000) : null;
