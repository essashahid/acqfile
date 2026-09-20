import { scrubPayload } from "@/lib/deals/identifiers";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireDeal } from "@/lib/deals/service";
import { recordAttestation } from "@/lib/evaluation/attestations";
import {
  adviserContext,
  domainContext,
  portalData,
  createPortalLink,
  revokePortalLink,
  recordResponse,
  answerQuestion,
} from "@/lib/portal/service";
export async function POST(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return new Response(null, { status: 403 });
  const data = await request.formData(),
    kind = String(data.get("kind")),
    party = String(data.get("party") ?? ""),
    key = String(data.get("task") ?? "");
  try {
    if (kind === "link")
      return Response.json({ token: await createPortalLink(ctx, dealId, party) });
    if (kind === "revoke") await revokePortalLink(ctx, dealId, party);
    else if (kind === "answer")
      await answerQuestion(
        ctx,
        dealId,
        key,
        String(data.get("choice")),
        String(data.get("note") ?? ""),
      );
    else if (kind === "settings") {
      const s = z
        .object({
          firm: z.string().trim().min(1).max(100),
          contact: z.string().trim().min(1).max(100),
          email: z.email(),
          sendBy: z.union([z.iso.date(), z.literal("")]),
        })
        .parse(scrubPayload(Object.fromEntries(data)));
      await getDb()
        .update(schema.workspaces)
        .set({ firmName: s.firm })
        .where(eq(schema.workspaces.id, ctx.workspace.workspaceId));
      await getDb()
        .update(schema.deals)
        .set({ contactName: s.contact, contactEmail: s.email, sendBy: s.sendBy || null })
        .where(eq(schema.deals.id, dealId));
      await recordResponse(ctx, dealId, null, "contact", "settings", s);
    } else if (kind === "reminder_sent") {
      const [p] = await getDb()
        .select()
        .from(schema.parties)
        .where(and(eq(schema.parties.id, party), eq(schema.parties.dealId, dealId)));
      if (!p) throw Error("Person not found");
      await recordResponse(ctx, dealId, party, "reminder", kind, {});
    } else if (kind === "accept_later" || kind === "waive") {
      const p = await portalData(dealId),
        task = p.mapped.tasks.find((t) => t.key === key);
      if (!task) throw Error("Task not found");
      if (kind === "waive")
        for (const row of task.rows)
          await recordAttestation(domainContext(ctx), dealId, {
            kind: "waiver",
            rule_id: row.item_id,
            scope_key: row.scope_key,
            period: row.period || null,
            note: z.string().trim().min(1).parse(data.get("note")),
          });
      await recordResponse(ctx, dealId, task.partyId, key, kind, {
        note: String(data.get("note") ?? ""),
        date: task.response?.payload.date ?? null,
      });
    } else if (kind !== "revoke") return new Response(null, { status: 400 });
    if (["settings", "waive"].includes(kind))
      return Response.redirect(new URL(`/deals/${dealId}`, request.url), 303);
    return Response.json({ saved: true });
  } catch {
    return Response.json({ message: "Please check your answer and try again." }, { status: 400 });
  }
}
