import { requireStaff } from "@/lib/workspace";
import { validSourceUrl } from "@/lib/deals/source-url";
import { ORIGINAL_ACCESS_MESSAGE, openOriginal } from "@/lib/deals/originals";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealId: string; versionId: string }> },
) {
  const { dealId, versionId } = await params;
  const ctx = await requireStaff();
  const url = new URL(request.url);
  if (!validSourceUrl(url, dealId, versionId)) return new Response("Link expired", { status: 403 });
  let opened: Awaited<ReturnType<typeof openOriginal>>;
  try {
    opened = await openOriginal(ctx, dealId, versionId, Number(url.searchParams.get("expires")));
  } catch (error) {
    if (error instanceof Error && error.message === ORIGINAL_ACCESS_MESSAGE)
      return new Response(ORIGINAL_ACCESS_MESSAGE, { status: 403 });
    throw error;
  }
  if (!opened) return new Response("Not found", { status: 404 });
  const { version: v, bytes } = opened;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": v.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(v.sourceFilename)}`,
    },
  });
}
