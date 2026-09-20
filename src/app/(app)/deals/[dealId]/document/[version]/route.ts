import { validSourceUrl } from "@/lib/deals/source-url";
import { adviserContext, domainContext } from "@/lib/portal/service";
import { openOriginal } from "@/lib/deals/originals";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealId: string; version: string }> },
) {
  const { dealId, version } = await params,
    ctx = await adviserContext();
  if (!validSourceUrl(new URL(request.url), dealId, version))
    return new Response(null, { status: 404 });
  const opened = await openOriginal(
    domainContext(ctx),
    dealId,
    version,
    Math.floor(Date.now() / 1000),
  );
  if (!opened) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(opened.bytes), {
    headers: {
      "Content-Type": opened.version.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
