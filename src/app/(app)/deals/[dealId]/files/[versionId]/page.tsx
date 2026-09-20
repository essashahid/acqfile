import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { requireWorkspace } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { parsedVersion } from "@/lib/deals/blocks";
import { sourceUrl } from "@/lib/deals/source-url";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import type { FilingRecord } from "@/lib/deals/filing";
import { FileReview } from "../../../FileReview";
export default async function FilePage({
  params,
}: {
  params: Promise<{ dealId: string; versionId: string }>;
}) {
  const { dealId, versionId } = await params;
  const ctx = await requireWorkspace();
  await requireDeal(ctx, dealId);
  const db = getDb();
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.id, versionId),
        eq(schema.documentVersions.dealId, dealId),
      ),
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
  const parties = await db
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, dealId));
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
    <div className="space-y-5">
      <Link href={`/deals/${dealId}`} className="underline">
        Back to deal
      </Link>
      <h1 className="text-xl font-semibold">{version.sourceFilename}</h1>
      <p className="text-sm font-mono break-all">
        SHA-256 {version.contentHash}
      </p>
      <FileReview
        dealId={dealId}
        versionId={versionId}
        recordId={record?.id ?? null}
        initial={
          (record?.payloadJson as FilingRecord | undefined)?.segments ?? []
        }
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
