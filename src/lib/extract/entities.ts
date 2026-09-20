import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { normalizeName } from "@/lib/rules/expressions";
import { ACCEPTED } from "@/lib/evaluation/run";
type Tx = Parameters<
  Parameters<ReturnType<typeof import("@/lib/db/client").getDb>["transaction"]>[0]
>[0];
type Owner = {
  name: string;
  percent: number;
  title?: string;
  identifier?: { hmac: string; last_four: string };
};
/** Match an extracted name or identifier to deal parties. An identifier match outranks a name match; names match only exactly after normalization. */
export function matchParty(
  parties: {
    id: string;
    legalName: string;
    nameVariants: unknown;
    identifierHmac: string | null;
  }[],
  name: string | null,
  hmac: string | null,
) {
  if (hmac) {
    const byId = parties.filter((p) => p.identifierHmac === hmac);
    if (byId.length) return byId;
  }
  const n = normalizeName(name ?? "");
  if (!n) return [];
  return parties.filter((p) =>
    [p.legalName, ...(Array.isArray(p.nameVariants) ? p.nameVariants : [])].some(
      (v) => typeof v === "string" && normalizeName(v) === n,
    ),
  );
}
/** Rebuild extracted ownership links for the party a segment belongs to from every accepted ownership fact. Ambiguity or an outside party raises party_assignment. */
export async function resolveOwnership(
  tx: Tx,
  dealId: string,
  ownedPartyId: string | null,
  versionId: string,
  segmentId: string,
) {
  if (!ownedPartyId) return;
  const parties = await tx.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
  const segments = await tx
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.dealId, dealId),
        eq(schema.segments.partyId, ownedPartyId),
        eq(schema.segments.isCurrent, true),
        eq(schema.segments.status, "confirmed"),
      ),
    );
  const facts = segments.length
    ? await tx
        .select()
        .from(schema.facts)
        .where(
          and(
            inArray(
              schema.facts.segmentId,
              segments.map((s) => s.id),
            ),
            eq(schema.facts.attribute, "ownership.members"),
            eq(schema.facts.isCurrent, true),
            inArray(schema.facts.routingStatus, [...ACCEPTED]),
          ),
        )
    : [];
  await tx
    .delete(schema.ownershipLinks)
    .where(
      and(
        eq(schema.ownershipLinks.dealId, dealId),
        eq(schema.ownershipLinks.ownedPartyId, ownedPartyId),
        eq(schema.ownershipLinks.origin, "extracted"),
      ),
    );
  const links = new Map<string, number>();
  for (const f of facts)
    for (const [i, owner] of (f.valueJson as Owner[]).entries()) {
      const matches = matchParty(parties, owner.name, owner.identifier?.hmac ?? null).filter(
        (p) => p.id !== ownedPartyId,
      );
      if (matches.length === 1) {
        links.set(matches[0]!.id, owner.percent);
        continue;
      }
      await tx
        .insert(schema.intakeReviews)
        .values({
          dealId,
          documentVersionId: versionId,
          segmentId,
          attribute: "ownership.members",
          type: "party_assignment",
          reason: matches.length
            ? `Owner row ${i + 1} matches more than one deal party.`
            : `Owner row ${i + 1} names a party outside the deal.`,
        })
        .onConflictDoNothing();
    }
  for (const [owner, percent] of links)
    await tx
      .insert(schema.ownershipLinks)
      .values({
        dealId,
        ownerPartyId: owner,
        ownedPartyId,
        percent: String(percent),
        stage: "post_closing",
        origin: "extracted",
      })
      .onConflictDoNothing();
}
