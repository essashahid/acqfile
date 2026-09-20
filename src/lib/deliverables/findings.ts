import { requestEvaluation } from "@/lib/evaluation/run";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { scrubPayload } from "@/lib/deals/identifiers";
import type { SessionContext } from "@/lib/workspace";

export const DecisionSchema = z.object({
  finding_key: z.string().min(1),
  action: z.enum(["dismiss", "waive"]),
  reason: z.string().trim().min(1).max(1000),
});

/** A48: dismiss and waive need a reason and are audit events. A waiver also waives the checklist row. */
export async function decideFinding(context: SessionContext, dealId: string, raw: unknown) {
  await assertMutation(context, "finding-decide");
  await requireDeal(context, dealId);
  const input = DecisionSchema.parse(raw);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select()
      .from(schema.findings)
      .where(
        and(eq(schema.findings.dealId, dealId), eq(schema.findings.findingKey, input.finding_key)),
      );
    if (!finding) throw Error("Finding not found");
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: context.user.id,
        action: `finding_${input.action}`,
        entityType: "finding",
        entityId: finding.id,
        maskedBefore: { status: finding.status },
        maskedAfter: {
          status: input.action === "dismiss" ? "dismissed" : "waived",
          reason: scrubPayload(input.reason),
        },
      })
      .returning();
    await tx
      .update(schema.findings)
      .set({
        status: input.action === "dismiss" ? "dismissed" : "waived",
        reason: scrubPayload(input.reason),
        actorId: context.user.id,
      })
      .where(eq(schema.findings.id, finding.id));
    if (input.action === "waive")
      await tx
        .insert(schema.attestations)
        .values({
          dealId,
          kind: "waiver",
          ruleId: finding.ruleId,
          scopeKey: finding.scopeKey,
          period: finding.period ?? "",
          key: "",
          note: scrubPayload(input.reason),
          actorId: context.user.id,
          auditEventId: event!.id,
        })
        .onConflictDoNothing();
  });
  await requestEvaluation(dealId);
}
