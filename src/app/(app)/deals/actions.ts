"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { saveDeal } from "@/lib/deals/service";
import { processDealRun } from "@/lib/deals/process";
import { reviewFile, undoSupersession } from "@/lib/deals/filing";
import { assertMutation } from "@/lib/access";
import { intake } from "@/lib/deals/intake";
export async function saveDealAction(
  raw: unknown,
  id?: string,
  revision?: number,
) {
  const context = await requireWorkspace();
  const dealId = await saveDeal(context, raw, id, revision);
  revalidatePath("/deals");
  return dealId;
}
export async function uploadDealAction(dealId: string, data: FormData) {
  const context = await requireWorkspace();
  const files = data
    .getAll("files")
    .filter((v): v is File => v instanceof File);
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

export async function reviewFileAction(
  dealId: string,
  versionId: string,
  input: unknown,
) {
  const ctx = await requireWorkspace();
  await reviewFile(ctx, dealId, versionId, input);
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
