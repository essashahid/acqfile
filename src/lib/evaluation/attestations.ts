import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import type { SessionContext } from "@/lib/workspace";
import { requestEvaluation } from "./run";
import { requireDeal } from "@/lib/deals/service";
const AttestationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tracking"),
    rule_id: z.string().min(1),
    scope_key: z.string().min(1),
    state: z.enum(["not_started", "ordered", "received"]),
    note: z.string().min(1),
  }),
  z.object({
    kind: z.literal("manual_confirmation"),
    rule_id: z.string().min(1),
    scope_key: z.string().min(1),
    period: z.string().nullable().default(null),
    key: z.string().min(1),
    confirmed: z.boolean(),
    note: z.string().min(1),
  }),
  z.object({
    kind: z.literal("waiver"),
    rule_id: z.string().min(1),
    scope_key: z.string().min(1),
    period: z.string().nullable().default(null),
    note: z.string().min(1),
  }),
]);
/** Operator attestations feed tracking, manual confirmation and waiver checks; each is audited and re-evaluates the deal. */
export async function recordAttestation(context: SessionContext, dealId: string, raw: unknown) {
  await assertMutation(context, "deal-attest");
  await requireDeal(context, dealId);
  const input = AttestationSchema.parse(raw);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: context.user.id,
        action: `attestation_${input.kind}`,
        entityType: "rule",
        entityId: dealId,
        maskedAfter: input,
      })
      .returning();
    const values = {
      dealId,
      kind: input.kind,
      ruleId: input.rule_id,
      scopeKey: input.scope_key,
      period: "period" in input ? (input.period ?? "") : "",
      key: "key" in input ? input.key : "",
      state: input.kind === "tracking" ? input.state : null,
      confirmed: input.kind === "manual_confirmation" ? input.confirmed : null,
      note: input.note,
      actorId: context.user.id,
      auditEventId: event!.id,
    };
    await tx
      .insert(schema.attestations)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.attestations.dealId,
          schema.attestations.kind,
          schema.attestations.ruleId,
          schema.attestations.scopeKey,
          schema.attestations.period,
          schema.attestations.key,
        ],
        set: values,
      });
  });
  await requestEvaluation(dealId);
}
