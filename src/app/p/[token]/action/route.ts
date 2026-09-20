import { after } from "next/server";
import { resolvePortal, tellUs, answerQuestion, keepDocument } from "@/lib/portal/service";
import { startUpload } from "@/lib/portal/upload";
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params,
    access = await resolvePortal(token);
  if (!access)
    return Response.json({ message: "Please ask your adviser for a new link." }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const data = await request.formData(),
    kind = String(data.get("kind")),
    task = String(data.get("task"));
  try {
    if (kind === "upload") {
      const files = data.getAll("files").filter((f): f is File => f instanceof File);
      const work = await startUpload(
        access,
        task,
        await Promise.all(
          files.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
        ),
        data.get("replace") ? String(data.get("replace")) : undefined,
        String(data.get("note") ?? ""),
      );
      after(work.work);
      return Response.json({ receipt: work.response.id });
    }
    if (kind === "answer")
      await answerQuestion(
        access.ctx,
        access.deal.id,
        task,
        String(data.get("choice")),
        String(data.get("note") ?? ""),
        access,
      );
    else if (kind === "cant_send")
      await tellUs(access, task, {
        reason: data.get("reason"),
        date: data.get("date") || undefined,
        note: data.get("note") ?? "",
      });
    else if (kind === "keep_document") {
      await keepDocument(access, task);
    } else return new Response(null, { status: 400 });
    return Response.json({ saved: true });
  } catch (e) {
    const message =
      e instanceof Error && e.message.startsWith("Please ")
        ? e.message
        : "We couldn't save that just now. Please return to your list and try again.";
    return Response.json({ message }, { status: 400 });
  }
}
