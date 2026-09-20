import { RETRY_SCHEDULE_MS } from "@/lib/config";
import { runStep, StepFailure, type StepContext } from "@/lib/pipeline/steps-runner";
export async function durable<T>(
  ctx: StepContext,
  name: string,
  body: () => Promise<T>,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await runStep(ctx, name, body)).output;
    } catch (e) {
      const delay = RETRY_SCHEDULE_MS[attempt];
      if (!(e instanceof StepFailure) || !e.retryable || delay === undefined) throw e;
      await sleep(delay);
    }
  }
}
