import { resolvePortal } from "@/lib/portal/service";
import { uploadResult } from "@/lib/portal/upload";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string; receipt: string }> },
) {
  const { token, receipt } = await params,
    access = await resolvePortal(token);
  if (!access) return new Response(null, { status: 404 });
  try {
    return Response.json(await uploadResult(access, receipt), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
