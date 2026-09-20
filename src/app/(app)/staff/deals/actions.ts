"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/workspace";
import { saveDeal } from "@/lib/deals/service";
import { processDealRun, extractAfterReview } from "@/lib/deals/process";
import { reviewFact, resolveGap, reclassifySegment } from "@/lib/extract/review";
import { reviewFile, undoSupersession } from "@/lib/deals/filing";
import { assertMutation } from "@/lib/access";
import { intake } from "@/lib/deals/intake";
export async function saveDealAction(raw: unknown, id?: string, revision?: number) {
  const context = await requireStaff();
  const dealId = await saveDeal(context, raw, id, revision);
  revalidatePath("/staff/deals");
  return dealId;
}
export async function uploadDealAction(dealId: string, data: FormData) {
  const context = await requireStaff();
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
  revalidatePath(`/staff/deals/${dealId}`);
  return { batch: result.batch.number, count: result.rows.length };
}

export async function reviewFileAction(dealId: string, versionId: string, input: unknown) {
  const ctx = await requireStaff();
  await reviewFile(ctx, dealId, versionId, input);
  await extractAfterReview(ctx, dealId, versionId);
  revalidatePath(`/staff/deals/${dealId}`);
}
export async function undoAction(dealId: string, eventId: string) {
  await undoSupersession(await requireStaff(), dealId, eventId);
  revalidatePath(`/staff/deals/${dealId}`);
}
export async function retryDealRunAction(dealId: string, runId: string) {
  const ctx = await requireStaff();
  await assertMutation(ctx, "deal-retry");
  await processDealRun(ctx, dealId, runId);
  revalidatePath(`/staff/deals/${dealId}`);
}

export async function reviewFactAction(dealId: string, input: unknown) {
  const ctx = await requireStaff();
  const result = await reviewFact(ctx, dealId, input);
  revalidatePath(`/staff/deals/${dealId}`);
  return result;
}
export async function resolveGapAction(dealId: string, input: unknown) {
  const ctx = await requireStaff();
  await resolveGap(ctx, dealId, input);
  revalidatePath(`/staff/deals/${dealId}`);
}
export async function reclassifyAction(dealId: string, segmentId: string, comment: string) {
  const ctx = await requireStaff();
  const version = await reclassifySegment(ctx, dealId, segmentId, comment);
  revalidatePath(`/staff/deals/${dealId}`);
  return version;
}
