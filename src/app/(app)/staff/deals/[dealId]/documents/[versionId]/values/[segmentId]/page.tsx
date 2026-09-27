import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { sourceUrl } from "@/lib/deals/source-url";
import { parsedVersion } from "@/lib/deals/blocks";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { PENDING } from "@/lib/evaluation/run";
import { officialFieldName, officialFieldPage } from "@/lib/config/official-form-fields";
import { FactReview, type ReviewFact, type ReviewGap } from "../../../../../FactReview";
import { documentName } from "@/lib/staff/labels";
import { FACT_CATALOG } from "@/lib/domain/registry";
import { Pill } from "@/components/staff";

const GAP_TYPES = ["extraction_gap", "identifier_mismatch", "party_assignment"];

export default async function SegmentReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string; versionId: string; segmentId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { dealId, segmentId } = await params;
  const { from } = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const db = getDb();
  const base = `/staff/deals/${dealId}`;
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
  const facts = await db.select().from(schema.facts).where(eq(schema.facts.segmentId, segmentId));
  const gaps = await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.segmentId, segmentId),
        eq(schema.intakeReviews.status, "open"),
        inArray(schema.intakeReviews.type, GAP_TYPES),
      ),
    );
  const blocks = ((await parsedVersion(segment.documentVersionId))?.blocks ?? []).filter(
    (b) => b.page >= segment.pageStart && b.page <= segment.pageEnd,
  );
  // A value's form field comes from its stored source block; a missing value's from the form map.
  const fieldOf = (block: string | undefined) =>
    block?.startsWith("field:") ? block.slice(6).replace(/:\d+$/, "") : undefined;
  const mappedPage = (field: string) => {
    try {
      return segment.pageStart - 1 + officialFieldPage(segment.docType, field);
    } catch {
      return undefined;
    }
  };
  const fieldPage = (field: string) =>
    blocks.find((b) => b.locator.startsWith(`field:${field}:`))?.page ?? mappedPage(field);
  const allRows: ReviewFact[] = facts
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
      field: fieldOf((f.locatorJson as { source_block?: string }).source_block),
      widget: Number(
        (f.locatorJson as { source_block?: string }).source_block?.match(/^field:.*:(\d+)$/)?.[1] ??
          0,
      ),
      recordVersion: f.recordVersion,
      reviewNote: f.reviewNote,
    }))
    .sort(
      (a, b) =>
        Number((PENDING as readonly string[]).includes(b.routing)) -
          Number((PENDING as readonly string[]).includes(a.routing)) ||
        a.attribute.localeCompare(b.attribute),
    );
  const currentIds = new Set(facts.filter((f) => f.isCurrent).map((f) => f.id));
  const rows = allRows.filter((f) => currentIds.has(f.id));
  const history = allRows.filter((f) => !currentIds.has(f.id));
  const currentAttributes = new Set(rows.map((f) => f.attribute));
  const availableAttributes = FACT_CATALOG.filter(
    (definition) =>
      (definition.producers as string[]).includes(segment.docType) &&
      !currentAttributes.has(definition.attribute),
  ).map((definition) => definition.attribute);
  const gapRows: ReviewGap[] = gaps.map((g) => {
    const field = g.attribute ? officialFieldName(segment.docType, g.attribute) : undefined;
    return {
      id: g.id,
      type: g.type,
      attribute: g.attribute,
      reason: g.reason,
      field: field ?? undefined,
      page: field ? fieldPage(field) : undefined,
    };
  });
  const toReview =
    rows.filter((r) => (PENDING as readonly string[]).includes(r.routing)).length + gapRows.length;
  const decided =
    rows.length - rows.filter((r) => (PENDING as readonly string[]).includes(r.routing)).length;

  // The next document on this deal that still has values to review, in reading order.
  const [pendingFacts, openGaps] = await Promise.all([
    db
      .select({ segmentId: schema.facts.segmentId })
      .from(schema.facts)
      .where(
        and(
          eq(schema.facts.dealId, dealId),
          eq(schema.facts.isCurrent, true),
          inArray(schema.facts.routingStatus, [...PENDING]),
        ),
      ),
    db
      .select({ segmentId: schema.intakeReviews.segmentId })
      .from(schema.intakeReviews)
      .where(
        and(
          eq(schema.intakeReviews.dealId, dealId),
          eq(schema.intakeReviews.status, "open"),
          inArray(schema.intakeReviews.type, GAP_TYPES),
        ),
      ),
  ]);
  const waiting = new Set(
    [...pendingFacts, ...openGaps].map((r) => r.segmentId).filter((id): id is string => !!id),
  );
  waiting.delete(segmentId);
  const candidates = waiting.size
    ? await db
        .select()
        .from(schema.segments)
        .where(and(eq(schema.segments.dealId, dealId), inArray(schema.segments.id, [...waiting])))
    : [];
  const next = candidates.sort(
    (a, b) =>
      documentName(a.docType).localeCompare(documentName(b.docType)) || a.pageStart - b.pageStart,
  )[0];
  const back =
    from === "overview"
      ? { href: base, label: "Back to Next up" }
      : { href: `${base}/documents`, label: "Documents" };
  return (
    <div>
      <header className="vr-head">
        <Link className="vr-back" href={back.href}>
          <ArrowLeft size={14} aria-hidden />
          {back.label}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="vr-title">
            {documentName(segment.docType)} · {party?.legalName ?? "No party"}
          </h1>
          <p className="meta">
            {version?.sourceFilename} · pages {segment.pageStart}–{segment.pageEnd}
            {segment.period ? ` · ${segment.period}` : ""} ·{" "}
            <Link className="link" href={`${base}/documents/${segment.documentVersionId}`}>
              Filing
            </Link>{" "}
            <Pill value={segment.status} />
          </p>
        </div>
        <div className="vr-counts">
          <span>
            <b>{toReview}</b> to review
          </span>
          <span className="meta">
            <b>{decided}</b> decided
          </span>
          {next ? (
            <Link
              className="btn btn-sm"
              href={`${base}/documents/${next.documentVersionId}/values/${next.id}${from ? `?from=${from}` : ""}`}
            >
              Next document
              <ChevronRight size={14} aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>
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
        history={history}
        gaps={gapRows}
        availableAttributes={availableAttributes}
        editable={mutationAllowed(ctx)}
      />
    </div>
  );
}
