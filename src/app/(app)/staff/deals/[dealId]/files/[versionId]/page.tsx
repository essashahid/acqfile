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
import { PageHead, Pill } from "@/components/staff";
export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string; versionId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { dealId, versionId } = await params;
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
  return (
    <div>
      <PageHead
        eyebrow={
          <Link href={`/staff/deals/${dealId}`} className="link">
            Back to the deal
          </Link>
        }
        title={version.sourceFilename}
        subtitle={
          <>
            {version.pageCount ?? 1} {version.pageCount === 1 ? "page" : "pages"} · SHA-256{" "}
            {version.contentHash.slice(0, 16)}…
          </>
        }
        actions={<Pill value={version.parseStatus} />}
      />
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
        blocks={blocks.map((b) => ({ locator: b.locator, rawText: b.text }))}
        editable={mutationAllowed(ctx)}
        conflict={reviews.some((r) => r.type === "version_conflict")}
      />
    </div>
  );
}
