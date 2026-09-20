import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { requireWorkspace } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { sourceUrl } from "@/lib/deals/source-url";
import { parsedVersion } from "@/lib/deals/blocks";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { PENDING } from "@/lib/evaluation/run";
import { FactReview, type ReviewFact, type ReviewGap } from "../../../../FactReview";
export default async function SegmentReviewPage({
  params,
}: {
  params: Promise<{ dealId: string; segmentId: string }>;
}) {
  const { dealId, segmentId } = await params;
  const ctx = await requireWorkspace();
  await requireDeal(ctx, dealId);
  const db = getDb();
  const [segment] = await db
    .select()
    .from(schema.segments)
    .where(and(eq(schema.segments.id, segmentId), eq(schema.segments.dealId, dealId)));
  if (!segment) throw Error("Segment not found");
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.id, segment.documentVersionId));
  const [party] = segment.partyId
    ? await db.select().from(schema.parties).where(eq(schema.parties.id, segment.partyId))
    : [];
  const facts = await db
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.segmentId, segmentId), eq(schema.facts.isCurrent, true)));
  const gaps = await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.segmentId, segmentId),
        eq(schema.intakeReviews.status, "open"),
        inArray(schema.intakeReviews.type, [
          "extraction_gap",
          "identifier_mismatch",
          "party_assignment",
        ]),
      ),
    );
  const blocks = ((await parsedVersion(segment.documentVersionId))?.blocks ?? []).filter(
    (b) => b.page >= segment.pageStart && b.page <= segment.pageEnd,
  );
  const rows: ReviewFact[] = facts
    .map((f) => ({
      id: f.id,
      attribute: f.attribute,
      value: f.valueJson,
      method: f.method,
      confidence: Number(f.confidence),
      components: f.confidenceComponents as Record<string, number>,
      routing: f.routingStatus,
      verifierReason: f.verifierReason,
      correctedValue: f.correctedValueJson,
      validation: (f.validationJson as { code: string; level: string }[]).map(
        (m) => `${m.level}: ${m.code}`,
      ),
      page: (f.locatorJson as { page: number }).page,
      quote: (f.locatorJson as { quote: string }).quote,
      verbatim: (f.locatorJson as { verbatim?: boolean }).verbatim !== false,
      recordVersion: f.recordVersion,
      reviewNote: f.reviewNote,
    }))
    .sort(
      (a, b) =>
        Number((PENDING as readonly string[]).includes(b.routing)) -
          Number((PENDING as readonly string[]).includes(a.routing)) ||
        a.attribute.localeCompare(b.attribute),
    );
  const gapRows: ReviewGap[] = gaps.map((g) => ({
    id: g.id,
    type: g.type,
    attribute: g.attribute,
    reason: g.reason,
  }));
  return (
    <div className="space-y-5">
      <Link href={`/deals/${dealId}`} className="underline">
        Back to deal
      </Link>
      <h1 className="text-xl font-semibold">
        {segment.docType} · {party?.legalName ?? "No party"} · {segment.period ?? "No period"}
      </h1>
      <p className="text-sm">
        {version?.sourceFilename} · pages {segment.pageStart}–{segment.pageEnd} ·{" "}
        <Link className="underline" href={`/deals/${dealId}/files/${segment.documentVersionId}`}>
          Filing
        </Link>
      </p>
      <FactReview
        dealId={dealId}
        segmentId={segmentId}
        versionId={segment.documentVersionId}
        pageStart={segment.pageStart}
        pageEnd={segment.pageEnd}
        pdf={version?.mimeType === "application/pdf"}
        url={originalAccessAllowed(ctx) ? sourceUrl(dealId, segment.documentVersionId) : null}
        blocks={blocks.map((b) => ({ locator: b.locator, page: b.page, text: b.text }))}
        facts={rows}
        gaps={gapRows}
        editable={mutationAllowed(ctx)}
      />
    </div>
  );
}
