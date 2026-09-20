import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import {
  DealProfileSchema,
  PartySchema,
  OwnershipSchema,
} from "@/lib/domain/profile";
import { loadPack } from "@/lib/rules/loader";
import { selectPack } from "@/lib/rules/engine";
import { assertMutation } from "@/lib/access";
import type { SessionContext } from "@/lib/workspace";
import { scrubPayload } from "./identifiers";
export const DealDraftSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/),
  name: z.string().min(1).max(200),
  as_of: z.iso.date(),
  profile: DealProfileSchema,
  parties: z.array(PartySchema),
  ownership: z.array(OwnershipSchema),
  overlay: z.enum(["sample-lender-a"]).nullable().optional(),
});
export type DealDraft = z.infer<typeof DealDraftSchema>;
export async function requireDeal(context: SessionContext, id: string) {
  z.uuid().parse(id);
  const [deal] = await getDb()
    .select()
    .from(schema.deals)
    .where(
      and(
        eq(schema.deals.id, id),
        eq(schema.deals.workspaceId, context.workspace.workspaceId),
      ),
    );
  if (!deal) throw Error("Deal not found");
  return deal;
}
export async function readDeal(context: SessionContext, id: string) {
  const deal = await requireDeal(context, id);
  const parties = await getDb()
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, id));
  const ownership = await getDb()
    .select()
    .from(schema.ownershipLinks)
    .where(eq(schema.ownershipLinks.dealId, id));
  return { deal, parties, ownership };
}
export async function saveDeal(
  context: SessionContext,
  raw: unknown,
  id?: string,
  revision?: number,
) {
  await assertMutation(context, "deal-save");
  const d = DealDraftSchema.parse(scrubPayload(raw));
  if (new Set(d.parties.map((p) => p.id)).size !== d.parties.length)
    throw Error("Party IDs must be unique");
  const ids = new Set(d.parties.map((p) => p.id));
  if (
    d.ownership.some(
      (o) =>
        !ids.has(o.owner_party_id) ||
        !ids.has(o.owned_party_id) ||
        o.owner_party_id === o.owned_party_id,
    ) ||
    d.parties.some(
      (p) =>
        Array.isArray(p.affiliates) && p.affiliates.some((a) => !ids.has(a)),
    )
  )
    throw Error("Ownership and affiliate links must name declared parties");
  const pack = selectPack(d.profile.expected_loan_number_date, [
    loadPack("sop-50-10-8"),
    loadPack("sop-50-10-8-1"),
  ]).pack;
  const overlay =
    d.overlay ??
    (d.profile.target_lender === "Sample Lender A" ? "sample-lender-a" : null);
  if (pack) loadPack(pack.version, overlay ?? undefined);
  return getDb().transaction(async (tx) => {
    const dealId = id ?? randomUUID();
    let previous: unknown = null;
    const aliases = new Map<string, string>();
    const externalKeys = new Map<string, string>();
    if (id) {
      await requireDeal(context, id);
      const [old] = await tx
        .select()
        .from(schema.deals)
        .where(eq(schema.deals.id, id))
        .for("update");
      if (old!.revision !== revision)
        throw Error("Stale edit. Reload the deal before saving.");
      previous = old;
      const existing = await tx
        .select()
        .from(schema.parties)
        .where(eq(schema.parties.dealId, id));
      for (const p of existing) {
        if (!d.parties.some((x) => x.id === p.id || x.id === p.externalKey))
          throw Error(
            "Keep existing parties; change their roles or name instead of removing evidence identities.",
          );
        externalKeys.set(p.id, p.externalKey ?? p.id);
        aliases.set(p.externalKey ?? p.id, p.id);
        aliases.set(p.id, p.id);
      }
    }
    for (const p of d.parties)
      if (!aliases.has(p.id)) aliases.set(p.id, randomUUID());
    const profile = scrubPayload({
      ...d.profile,
      paid_agents: Array.isArray(d.profile.paid_agents)
        ? d.profile.paid_agents.map((a) => ({
            ...a,
            party: aliases.get(a.party) ?? a.party,
          }))
        : d.profile.paid_agents,
      equity_sources: Array.isArray(d.profile.equity_sources)
        ? d.profile.equity_sources.map((a) => ({
            ...a,
            party: aliases.get(a.party) ?? a.party,
          }))
        : d.profile.equity_sources,
    });
    const values = {
      code: d.code,
      name: scrubPayload(d.name),
      profileJson: profile,
      rulePackVersion: pack?.version ?? "unknown",
      overlayId: overlay,
      asOfDate: d.as_of,
      expectedLoanNumberDate:
        d.profile.expected_loan_number_date === "unknown"
          ? null
          : d.profile.expected_loan_number_date,
      targetSubmissionDate:
        d.profile.target_submission_date === "unknown"
          ? null
          : d.profile.target_submission_date,
    };
    if (id)
      await tx
        .update(schema.deals)
        .set({ ...values, revision: sql`${schema.deals.revision}+1` })
        .where(eq(schema.deals.id, id));
    else
      await tx.insert(schema.deals).values({
        ...values,
        id: dealId,
        workspaceId: context.workspace.workspaceId,
      });
    for (const p of d.parties) {
      const values = {
        id: aliases.get(p.id)!,
        dealId,
        externalKey: externalKeys.get(aliases.get(p.id)!) ?? p.id,
        kind: p.kind,
        roles: p.roles,
        legalName: scrubPayload(p.legal_name),
        nameVariants: scrubPayload(p.name_variants),
        identifierHmac: p.identifier?.hmac ?? null,
        identifierLastFour: p.identifier?.last_four ?? null,
        jointlyHeldAssets: p.jointly_held_assets,
        affiliates: Array.isArray(p.affiliates)
          ? p.affiliates.map((a) => aliases.get(a)!)
          : p.affiliates,
      };
      await tx
        .insert(schema.parties)
        .values(values)
        .onConflictDoUpdate({ target: schema.parties.id, set: values });
    }
    await tx
      .delete(schema.ownershipLinks)
      .where(eq(schema.ownershipLinks.dealId, dealId));
    for (const o of d.ownership)
      await tx.insert(schema.ownershipLinks).values({
        dealId,
        ownerPartyId: aliases.get(o.owner_party_id)!,
        ownedPartyId: aliases.get(o.owned_party_id)!,
        percent: o.percent === "unknown" ? null : String(o.percent),
        stage: o.stage,
        origin: o.origin,
      });
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: id ? "deal_updated" : "deal_created",
      entityType: "deal",
      entityId: dealId,
      maskedBefore: previous,
      maskedAfter: scrubPayload(d),
    });
    return dealId;
  });
}
export async function dealDraft(
  context: SessionContext,
  id: string,
): Promise<DealDraft> {
  const { deal, parties, ownership } = await readDeal(context, id);
  return {
    code: deal.code,
    name: deal.name,
    as_of: deal.asOfDate,
    profile: deal.profileJson,
    overlay: deal.overlayId as DealDraft["overlay"],
    parties: parties.map((p) =>
      PartySchema.parse({
        id: p.id,
        kind: p.kind,
        roles: p.roles,
        legal_name: p.legalName,
        name_variants: p.nameVariants,
        identifier: p.identifierHmac
          ? { hmac: p.identifierHmac, last_four: p.identifierLastFour }
          : null,
        jointly_held_assets: p.jointlyHeldAssets,
        affiliates: p.affiliates,
      }),
    ),
    ownership: ownership.map((o) =>
      OwnershipSchema.parse({
        owner_party_id: o.ownerPartyId,
        owned_party_id: o.ownedPartyId,
        percent: o.percent === null ? "unknown" : Number(o.percent),
        stage: o.stage,
        origin: o.origin,
      }),
    ),
  };
}
