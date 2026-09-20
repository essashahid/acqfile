import { validSourceUrl } from "@/lib/deals/source-url";
import { adviserContext, domainContext, portalData } from "@/lib/portal/service";
import { requireDeal } from "@/lib/deals/service";
import { createSnapshot } from "@/lib/deliverables/snapshot";
import { packageZip } from "@/lib/deliverables/package";
import { openOriginal } from "@/lib/deals/originals";
export async function GET(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  if (!validSourceUrl(new URL(request.url), dealId, dealId))
    return new Response(null, { status: 404 });
  const p = await portalData(dealId);
  if (!p.mapped.ready) return new Response("The lender file isn't ready yet.", { status: 409 });
  const snapshot = await createSnapshot(domainContext(ctx), dealId);
  const zip = await packageZip(dealId, snapshot.id);
  for (const v of p.data.versions)
    await openOriginal(domainContext(ctx), dealId, v.id, Math.floor(Date.now() / 1000));
  return new Response(new Uint8Array(zip.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="Lender file.zip"',
      "Cache-Control": "private, no-store",
    },
  });
}
