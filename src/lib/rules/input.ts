import { z } from "zod";
import { DealProfileSchema, PartySchema, OwnershipSchema, DateOnly } from "@/lib/domain/profile";
import { SegmentSchema, FactSchema } from "@/lib/domain/evidence";
const Attestation = z.strictObject({
  rule_id: z.string(),
  scope_key: z.string(),
  period: z.string().nullable(),
  actor: z.string().min(1),
  note: z.string().min(1),
  audit_event_id: z.string().min(1),
});
export const EngineInputSchema = z
  .strictObject({
    profile: DealProfileSchema,
    parties: z.array(PartySchema),
    ownership: z.array(OwnershipSchema),
    segments: z.array(SegmentSchema),
    accepted_facts: z.array(FactSchema),
    pending_facts: z.array(FactSchema),
    tracking: z.array(
      z.strictObject({
        rule_id: z.string(),
        scope_key: z.string(),
        state: z.enum(["not_started", "ordered", "received"]),
        actor: z.string().min(1),
        note: z.string().min(1),
      }),
    ),
    manual_confirmations: z.array(Attestation.extend({ key: z.string(), confirmed: z.boolean() })),
    waivers: z.array(Attestation),
    as_of: DateOnly,
    // An evaluation's evidence inventory is fixed. Deleting a referenced input is
    // unknown, not silent conflict resolution. New snapshots can supersede evidence.
    evidence_inventory: z.strictObject({
      segment_ids: z.array(z.string()),
      fact_ids: z.array(z.string()),
    }),
  })
  .superRefine((input, ctx) => {
    for (const [name, values] of [
      ["tracking", input.tracking.map((t) => [t.rule_id, t.scope_key])],
      [
        "confirmation",
        input.manual_confirmations.map((t) => [t.rule_id, t.scope_key, t.period, t.key]),
      ],
      ["waiver", input.waivers.map((t) => [t.rule_id, t.scope_key, t.period])],
      ["ownership", input.ownership.map((t) => [t.owner_party_id, t.owned_party_id, t.stage])],
    ] as const) {
      if (new Set(values.map((v) => JSON.stringify(v))).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${name} key` });
    }
    for (const name of ["equity_sources", "paid_agents"] as const) {
      const values = input.profile[name];
      if (Array.isArray(values) && new Set(values.map((v) => v.id)).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${name} id` });
    }
    for (const [name, values] of [
      ["party", input.parties],
      ["segment", input.segments],
      ["fact", [...input.accepted_facts, ...input.pending_facts]],
    ] as const) {
      if (new Set(values.map((v) => v.id)).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${name} id` });
    }
  });
export type EngineInput = z.infer<typeof EngineInputSchema>;
