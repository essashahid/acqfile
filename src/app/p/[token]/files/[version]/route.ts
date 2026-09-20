import { resolvePortal, mayOpenOriginal, recordResponse } from "@/lib/portal/service";
import { openOriginal } from "@/lib/deals/originals";
import { validSourceUrl } from "@/lib/deals/source-url";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; version: string }> },
) {
  const { token, version } = await params,
    p = await resolvePortal(token);
  if (
    !p ||
    !validSourceUrl(new URL(request.url), p.deal.id, version) ||
    !(await mayOpenOriginal(p, version))
  )
    return new Response(null, { status: 404 });
  const opened = await openOriginal(
    p.ctx,
    p.deal.id,
    version,
    Number(new URL(request.url).searchParams.get("expires")),
  );
  if (!opened) return new Response(null, { status: 404 });
  await recordResponse(p.ctx, p.deal.id, p.party.id, version, "original_open", {}, p.link.id);
  return new Response(new Uint8Array(opened.bytes), {
    headers: {
      "Content-Type": opened.version.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
