import { validSourceUrl } from "@/lib/deals/source-url";
import { adviserContext, domainContext, portalData } from "@/lib/portal/service";
import { requireDeal } from "@/lib/deals/service";
import { createSnapshot, listSnapshots, type SnapshotContent } from "@/lib/deliverables/snapshot";
import { packageZip } from "@/lib/deliverables/package";
import { openOriginal } from "@/lib/deals/originals";
export async function GET(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  if (!validSourceUrl(new URL(request.url), dealId, dealId))
    return new Response(null, { status: 404 });
  const p = await portalData(dealId);
  const selected = new URL(request.url).searchParams.get("version");
  if (!selected && !p.mapped.ready)
    return new Response("The lender file isn't ready yet.", { status: 409 });
  let snapshot;
  if (selected) {
    snapshot = (await listSnapshots(dealId)).find((s) => String(s.number) === selected);
    if (!snapshot || !(snapshot.contentJson as SnapshotContent).preparation?.ready)
      return new Response("Prepared version not found", { status: 404 });
  } else {
    try {
      snapshot = await createSnapshot(domainContext(ctx), dealId, { requirePrepared: true });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "The current file is not prepared for lender review."
      )
        return new Response("The lender file isn't ready yet.", { status: 409 });
      throw error;
    }
  }
  const zip = await packageZip(dealId, snapshot.id);
  const included = new Set(
    (snapshot.contentJson as SnapshotContent).manifest.map((entry) => entry.sha256),
  );
  for (const v of p.data.versions.filter((v) => included.has(v.contentHash)))
    await openOriginal(domainContext(ctx), dealId, v.id, Math.floor(Date.now() / 1000));
  return new Response(new Uint8Array(zip.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Lender file v${snapshot.number}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
