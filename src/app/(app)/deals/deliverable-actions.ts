"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { recordAttestation } from "@/lib/evaluation/attestations";
import { decideFinding } from "@/lib/deliverables/findings";
import { markRequestSent } from "@/lib/deliverables/requests";
import { createSnapshot } from "@/lib/deliverables/snapshot";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { processDealVersion } from "@/lib/deals/process";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
export async function attestAction(dealId: string, data: FormData) {
  const raw = Object.fromEntries(data);
  await recordAttestation(await requireWorkspace(), dealId, {
    ...raw,
    period: raw.period || null,
    confirmed: raw.confirmed === "true",
  });
  revalidatePath(`/deals/${dealId}`, "layout");
}
export async function decisionAction(dealId: string, data: FormData) {
  await decideFinding(await requireWorkspace(), dealId, Object.fromEntries(data));
  revalidatePath(`/deals/${dealId}`, "layout");
}
export async function sentAction(dealId: string, responsible: string) {
  await markRequestSent(await requireWorkspace(), dealId, responsible);
  revalidatePath(`/deals/${dealId}`, "layout");
}
export async function snapshotAction(dealId: string) {
  await createSnapshot(await requireWorkspace(), dealId);
  revalidatePath(`/deals/${dealId}`, "layout");
}
export async function retryFileAction(dealId: string, versionId: string) {
  const ctx = await requireWorkspace();
  await assertMutation(ctx, "deal-retry");
  await requireDeal(ctx, dealId);
  const [arrival] = await getDb()
    .select()
    .from(schema.intakeFiles)
    .where(eq(schema.intakeFiles.documentVersionId, versionId))
    .limit(1);
  if (!arrival) throw Error("File not found");
  await processDealVersion(ctx, dealId, versionId, arrival.runId);
  revalidatePath(`/deals/${dealId}`, "layout");
}
