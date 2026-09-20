"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { saveDeal } from "@/lib/deals/service";
import { processDealRun, extractAfterReview } from "@/lib/deals/process";
import { reviewFact, resolveGap, reclassifySegment } from "@/lib/extract/review";
import { reviewFile, undoSupersession } from "@/lib/deals/filing";
import { assertMutation } from "@/lib/access";
import { intake } from "@/lib/deals/intake";
export async function saveDealAction(raw: unknown, id?: string, revision?: number) {
  const context = await requireWorkspace();
  const dealId = await saveDeal(context, raw, id, revision);
  revalidatePath("/deals");
  return dealId;
}
export async function uploadDealAction(dealId: string, data: FormData) {
  const context = await requireWorkspace();
  const files = data.getAll("files").filter((v): v is File => v instanceof File);
  const paths = data.getAll("paths").map(String);
  const result = await intake(
    context,
    dealId,
    await Promise.all(
      files.map(async (f, i) => ({
        path: paths[i] ?? f.name,
        bytes: Buffer.from(await f.arrayBuffer()),
      })),
    ),
  );
  await processDealRun(context, dealId, result.runId);
  revalidatePath(`/deals/${dealId}`);
  return { batch: result.batch.number, count: result.rows.length };
}

export async function reviewFileAction(dealId: string, versionId: string, input: unknown) {
  const ctx = await requireWorkspace();
  await reviewFile(ctx, dealId, versionId, input);
  await extractAfterReview(ctx, dealId, versionId);
  revalidatePath(`/deals/${dealId}`);
}
export async function undoAction(dealId: string, eventId: string) {
  await undoSupersession(await requireWorkspace(), dealId, eventId);
  revalidatePath(`/deals/${dealId}`);
}
export async function retryDealRunAction(dealId: string, runId: string) {
  const ctx = await requireWorkspace();
  await assertMutation(ctx, "deal-retry");
  await processDealRun(ctx, dealId, runId);
  revalidatePath(`/deals/${dealId}`);
}

export async function reviewFactAction(dealId: string, input: unknown) {
  const ctx = await requireWorkspace();
  const result = await reviewFact(ctx, dealId, input);
  revalidatePath(`/deals/${dealId}`);
  return result;
}
export async function resolveGapAction(dealId: string, input: unknown) {
  const ctx = await requireWorkspace();
  await resolveGap(ctx, dealId, input);
  revalidatePath(`/deals/${dealId}`);
}
export async function reclassifyAction(dealId: string, segmentId: string, comment: string) {
  const ctx = await requireWorkspace();
  const version = await reclassifySegment(ctx, dealId, segmentId, comment);
  revalidatePath(`/deals/${dealId}`);
  return version;
}
