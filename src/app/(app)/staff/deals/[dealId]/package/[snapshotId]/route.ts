import { validSourceUrl } from "@/lib/deals/source-url";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { originalAccessAllowed } from "@/lib/access";
import { packageZip } from "@/lib/deliverables/package";
import { openOriginal } from "@/lib/deals/originals";
import { getDb, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import type { SnapshotContent } from "@/lib/deliverables/snapshot";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealId: string; snapshotId: string }> },
) {
  const { dealId, snapshotId } = await params;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  if (!originalAccessAllowed(ctx)) return new Response("Originals are restricted", { status: 403 });
  if (!validSourceUrl(new URL(request.url), dealId, snapshotId))
    return new Response("Link expired", { status: 403 });
  const [snap] = await getDb()
    .select()
    .from(schema.snapshots)
    .where(and(eq(schema.snapshots.id, snapshotId), eq(schema.snapshots.dealId, dealId)));
  if (!snap) return new Response("Not found", { status: 404 });
  const versions = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId));
  for (const hash of new Set((snap.contentJson as SnapshotContent).manifest.map((m) => m.sha256))) {
    const v = versions.find((v) => v.contentHash === hash);
    if (v)
      await openOriginal(
        ctx,
        dealId,
        v.id,
        Number(new URL(request.url).searchParams.get("expires")),
      );
  }
  const zip = await packageZip(dealId, snapshotId);
  return new Response(new Uint8Array(zip.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
