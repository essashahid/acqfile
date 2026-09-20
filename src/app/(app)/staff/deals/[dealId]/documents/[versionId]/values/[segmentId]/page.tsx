import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { sourceUrl } from "@/lib/deals/source-url";
import { parsedVersion } from "@/lib/deals/blocks";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { PENDING } from "@/lib/evaluation/run";
import { FactReview, type ReviewFact, type ReviewGap } from "../../../../../FactReview";
import { PageHead, Pill } from "@/components/staff";
export default async function SegmentReviewPage({
  params,
}: {
  params: Promise<{ dealId: string; versionId: string; segmentId: string }>;
}) {
  const { dealId, segmentId } = await params;
  const ctx = await requireStaff();
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
  const pending = rows.filter((r) => (PENDING as readonly string[]).includes(r.routing)).length;
  return (
    <div>
      <PageHead
        eyebrow={
          <Link href={`/staff/deals/${dealId}/documents`} className="link">
            Back to documents
          </Link>
        }
        title={`${segment.docType} · ${party?.legalName ?? "No party"}`}
        subtitle={
          <>
            {segment.period ?? "No period"} · {version?.sourceFilename} · pages {segment.pageStart}–
            {segment.pageEnd} ·{" "}
            <Link
              className="link"
              href={`/staff/deals/${dealId}/documents/${segment.documentVersionId}`}
            >
              Filing
            </Link>
          </>
        }
        actions={
          <>
            <Pill value={segment.status} />
            {pending ? <span className="pill pill-warn">{pending} pending</span> : null}
          </>
        }
      />
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
