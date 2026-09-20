import { Inngest, eventType } from "inngest";
import { z } from "zod";
/** A deal processing run requested by an operator; the run itself is durable in the database. */
export const dealRunRequested = eventType("deal.run.requested", {
  schema: z.object({
    dealId: z.string().uuid(),
    runId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
});
export const inngest = new Inngest({ id: "acqfile" });
