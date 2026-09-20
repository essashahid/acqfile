import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { parsedVersion } from "@/lib/deals/blocks";
import { sourceUrl } from "@/lib/deals/source-url";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import type { FilingRecord } from "@/lib/deals/filing";
import { FileReview } from "../../../FileReview";
import { documentName } from "@/lib/staff/labels";
import { Card, PageHead, Pill } from "@/components/staff";
export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string; versionId: string }>;
  searchParams: Promise<{ page?: string; returnTo?: string }>;
}) {
  const { dealId, versionId } = await params;
  const query = await searchParams;
  const back = query.returnTo?.startsWith(`/staff/deals/${dealId}/review?`)
    ? query.returnTo
    : `/staff/deals/${dealId}/documents`;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const db = getDb();
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(eq(schema.documentVersions.id, versionId), eq(schema.documentVersions.dealId, dealId)),
    );
  if (!version) throw Error("File not found");
  const [record] = await db
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, versionId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
  const blocks = (await parsedVersion(versionId))?.blocks ?? [];
  const reviews = await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.documentVersionId, versionId),
        eq(schema.intakeReviews.status, "open"),
      ),
    );
  const filed = await db
    .select()
    .from(schema.segments)
    .where(
      and(eq(schema.segments.documentVersionId, versionId), eq(schema.segments.isCurrent, true)),
    );
  return (
    <div>
      <PageHead
        eyebrow={
          <Link href={back} className="link">
            {query.returnTo ? "Back to review" : "Back to documents"}
          </Link>
        }
        title="Document detail"
        subtitle={
          <>
            {version.sourceFilename} ·{" "}
            {version.pageCount ? `${version.pageCount} pages` : "Page count unavailable"}
          </>
        }
        actions={<Pill value={version.parseStatus} />}
      />
      <Card className="mb-5" title="Filed documents and values">
        <div className="flex flex-wrap gap-3">
          {filed.map((s) => (
            <Link
              className="btn btn-sm"
              key={s.id}
              href={`/staff/deals/${dealId}/documents/${versionId}/values/${s.id}`}
            >
              {documentName(s.docType)} · {s.period ?? "Inspect values"}
            </Link>
          ))}
          {!filed.length ? (
            <p className="meta">No current documents filed from this source.</p>
          ) : null}
        </div>
      </Card>
      <FileReview
        initialPage={Math.max(
          1,
          Math.min(version.pageCount ?? 1, Number((await searchParams).page) || 1),
        )}
        dealId={dealId}
        versionId={versionId}
        recordId={record?.id ?? null}
        initial={(record?.payloadJson as FilingRecord | undefined)?.segments ?? []}
        parties={parties.map((p) => ({ id: p.id, name: p.legalName }))}
        pages={version.pageCount ?? 1}
        unreadable={version.parseStatus === "failed"}
        pdf={version.mimeType === "application/pdf"}
        url={originalAccessAllowed(ctx) ? sourceUrl(dealId, versionId) : null}
        blocks={blocks.map((b) => ({ locator: b.locator, page: b.page, rawText: b.text }))}
        editable={mutationAllowed(ctx)}
        conflict={reviews.some((r) => r.type === "version_conflict")}
      />
      <details className="reveal mt-5">
        <summary>Original file details</summary>
        <p className="meta mt-2 break-all">SHA-256: {version.contentHash}</p>
      </details>
    </div>
  );
}
