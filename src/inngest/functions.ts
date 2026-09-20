import { NonRetriableError, RetryAfterError } from "inngest";
import { eq } from "drizzle-orm";
import { dealRunRequested, inngest } from "./client";
import { RETRY_SCHEDULE_MS } from "@/lib/config";
import { StepFailure } from "@/lib/pipeline/steps-runner";
import { getDb, schema } from "@/lib/db/client";
import { getWorkspaceForUser } from "@/lib/workspace";
import { processDealRun } from "@/lib/deals/process";
function translate(err: unknown, attempt: number): never {
  if (err instanceof StepFailure && err.retryable)
    throw new RetryAfterError(
      err.message,
      RETRY_SCHEDULE_MS[Math.min(attempt, RETRY_SCHEDULE_MS.length - 1)] ?? 2000,
    );
  if (err instanceof StepFailure) throw new NonRetriableError(err.message, { cause: err });
  throw err;
}
/** Hosted transport for a deal run: every step stays idempotent in run_steps, so redelivery never repeats paid work. */
export const processDealRunFn = inngest.createFunction(
  {
    id: "deal-run",
    triggers: [dealRunRequested],
    retries: Math.min(RETRY_SCHEDULE_MS.length, 20) as 3,
    concurrency: { limit: 2 },
  },
  async ({ event, attempt }) => {
    const [user] = await getDb()
      .select()
      .from(schema.appUsers)
      .where(eq(schema.appUsers.id, event.data.userId));
    const workspace = await getWorkspaceForUser(event.data.userId);
    if (!user || !workspace) throw new NonRetriableError("Run initiator has no workspace");
    try {
      return await processDealRun(
        { user: { id: user.id, email: user.email, displayName: user.displayName }, workspace },
        event.data.dealId,
        event.data.runId,
      );
    } catch (err) {
      translate(err, attempt);
    }
  },
);
export const functions = [processDealRunFn];
