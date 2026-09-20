import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { maskIdentifier, VALUE_SCHEMAS } from "@/lib/domain/evidence";
import { FACTS } from "@/lib/domain/registry";
import { piiKey, scrubPayload } from "@/lib/deals/identifiers";
import type { SessionContext } from "@/lib/workspace";
import { normalizeFact } from "./values";
import { resolveOwnership } from "./entities";
import { requestEvaluation } from "@/lib/evaluation/run";
export const FactReviewSchema = z.object({
  fact_id: z.uuid(),
  expected_record_version: z.number().int().positive(),
  action: z.enum(["accept", "edit_accept", "reject", "needs_source"]),
  value: z.unknown().optional(),
  comment: z.string().min(1).max(1000),
});
/** Operator-entered value in catalog shape; identifiers are entered clear and stored masked by code (A15/A40). */
export function operatorValue(attribute: string, raw: unknown) {
  const def = FACTS[attribute];
  if (!def) throw Error("Unknown attribute");
  let value = raw;
  if (def.value_type === "identifier") {
    if (typeof raw === "string") value = maskIdentifier(raw, piiKey());
  } else if (typeof raw === "string" && def.value_type !== "text" && def.value_type !== "date") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw Error("Value is not valid JSON for this attribute");
    }
  }
  const parsed = VALUE_SCHEMAS[def.value_type].safeParse(value);
  if (!parsed.success) throw Error(`Value does not fit ${attribute}`);
  return parsed.data;
}
/** Accept, edit and accept, reject, or ask for a better copy. Every action is a new immutable fact row and an audit event; stale writes are rejected. */
export async function reviewFact(context: SessionContext, dealId: string, raw: unknown) {
  await assertMutation(context, "fact-review");
  await requireDeal(context, dealId);
  const input = FactReviewSchema.parse(raw);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`);
    const [current] = await tx
      .select()
      .from(schema.facts)
      .where(and(eq(schema.facts.id, input.fact_id), eq(schema.facts.dealId, dealId)));
    if (!current) throw Error("Fact not found");
    if (!current.isCurrent || current.recordVersion !== input.expected_record_version)
      throw Error("Stale review. Reload the segment before deciding.");
    if (input.action === "edit_accept" && (input.value === undefined || input.value === ""))
      throw Error("Enter the corrected value before accepting.");
    const value =
      input.action === "edit_accept"
        ? operatorValue(current.attribute, input.value)
        : current.valueJson;
    const routing =
      input.action === "reject"
        ? "rejected"
        : input.action === "needs_source"
          ? "needs_source"
          : "accepted";
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: context.user.id,
        action: `fact_${input.action}`,
        entityType: "fact",
        entityId: current.id,
        maskedBefore: scrubPayload({
          value: current.valueJson,
          routing: current.routingStatus,
          record_version: current.recordVersion,
        }),
        maskedAfter: scrubPayload({ value, routing, comment: input.comment }),
      })
      .returning();
    await tx.update(schema.facts).set({ isCurrent: false }).where(eq(schema.facts.id, current.id));
    const [next] = await tx
      .insert(schema.facts)
      .values({
        dealId,
        segmentId: current.segmentId,
        subjectPartyId: current.subjectPartyId,
        attribute: current.attribute,
        valueJson: value as object,
        normalizedValueJson: normalizeFact(current.attribute, value) as object,
        unit: current.unit,
        period: current.period,
        method: input.action === "edit_accept" ? "manual" : current.method,
        locatorJson: current.locatorJson,
        confidence: input.action === "edit_accept" ? "1" : current.confidence,
        confidenceComponents:
          input.action === "edit_accept" ? { operator: 1 } : current.confidenceComponents,
        validatorsPassed: input.action === "edit_accept" ? true : current.validatorsPassed,
        routingStatus: routing,
        actorId: context.user.id,
        auditEventId: event!.id,
        recordVersion: current.recordVersion + 1,
        isCurrent: true,
        documentVersionId: current.documentVersionId,
        verifierReason: current.verifierReason,
        validationJson: current.validationJson,
        correctedValueJson: null,
        ambiguity: current.ambiguity,
        reviewNote: input.comment,
      })
      .returning();
    if (current.attribute === "ownership.members") {
      const [segment] = await tx
        .select()
        .from(schema.segments)
        .where(eq(schema.segments.id, current.segmentId));
      await resolveOwnership(
        tx,
        dealId,
        segment?.partyId ?? null,
        current.documentVersionId ?? segment!.documentVersionId,
        current.segmentId,
      );
    }
    return { factId: next!.id, recordVersion: next!.recordVersion, eventId: event!.id };
  });
  await requestEvaluation(dealId);
  return result;
}
export const GapSchema = z.object({
  review_id: z.uuid(),
  action: z.enum(["enter", "dismiss"]),
  value: z.unknown().optional(),
  page: z.number().int().positive().optional(),
  quote: z.string().min(1).max(500).optional(),
  comment: z.string().min(1).max(1000),
});
/** Resolve an extraction gap: enter the value from the page (a manual fact, A14) or record that the document does not state it. */
export async function resolveGap(context: SessionContext, dealId: string, raw: unknown) {
  await assertMutation(context, "fact-review");
  await requireDeal(context, dealId);
  const input = GapSchema.parse(raw);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`);
    const [review] = await tx
      .select()
      .from(schema.intakeReviews)
      .where(
        and(eq(schema.intakeReviews.id, input.review_id), eq(schema.intakeReviews.dealId, dealId)),
      );
    if (!review || review.status !== "open" || !review.segmentId || !review.attribute)
      throw Error("Review item is not open");
    const [segment] = await tx
      .select()
      .from(schema.segments)
      .where(eq(schema.segments.id, review.segmentId));
    if (!segment) throw Error("Segment not found");
    const [event] = await tx
      .insert(schema.events)
      .values({
        dealId,
        actorId: context.user.id,
        action: input.action === "enter" ? "fact_entered" : "gap_dismissed",
        entityType: "segment",
        entityId: segment.id,
        maskedAfter: scrubPayload({
          attribute: review.attribute,
          comment: input.comment,
          page: input.page ?? null,
        }),
      })
      .returning();
    if (input.action === "enter") {
      const def = FACTS[review.attribute]!;
      const value = operatorValue(review.attribute, input.value);
      const page = input.page ?? segment.pageStart;
      if (page < segment.pageStart || page > segment.pageEnd)
        throw Error("Page lies outside the segment");
      await tx
        .update(schema.facts)
        .set({ isCurrent: false })
        .where(
          and(
            eq(schema.facts.segmentId, segment.id),
            eq(schema.facts.attribute, review.attribute),
            eq(schema.facts.isCurrent, true),
          ),
        );
      const [prior] = await tx
        .select({ v: sql<number>`coalesce(max(${schema.facts.recordVersion}),0)` })
        .from(schema.facts)
        .where(
          and(eq(schema.facts.segmentId, segment.id), eq(schema.facts.attribute, review.attribute)),
        );
      await tx.insert(schema.facts).values({
        dealId,
        segmentId: segment.id,
        subjectPartyId: def.subject_kind === "deal" ? null : segment.partyId,
        attribute: review.attribute,
        valueJson: value as object,
        normalizedValueJson: normalizeFact(review.attribute, value) as object,
        unit: def.unit,
        period: segment.period,
        method: "manual",
        locatorJson: {
          file: segment.documentVersionId,
          page,
          source_block: `page-${page}`,
          quote: scrubPayload(input.quote ?? "Entered by the operator from the page"),
          verbatim: false,
        },
        confidence: "1",
        confidenceComponents: { operator: 1 },
        validatorsPassed: true,
        routingStatus: "accepted",
        actorId: context.user.id,
        auditEventId: event!.id,
        recordVersion: Number(prior?.v ?? 0) + 1,
        isCurrent: true,
        documentVersionId: segment.documentVersionId,
        reviewNote: input.comment,
      });
      if (review.attribute === "ownership.members")
        await resolveOwnership(tx, dealId, segment.partyId, segment.documentVersionId, segment.id);
    }
    await tx
      .update(schema.intakeReviews)
      .set({ status: "resolved" })
      .where(eq(schema.intakeReviews.id, review.id));
  });
  await requestEvaluation(dealId);
}
/** Reclassify: send the segment back to filing review; the operator re-files the document and extraction reruns on confirmation. */
export async function reclassifySegment(
  context: SessionContext,
  dealId: string,
  segmentId: string,
  comment: string,
) {
  await assertMutation(context, "fact-review");
  await requireDeal(context, dealId);
  const db = getDb();
  const [segment] = await db
    .select()
    .from(schema.segments)
    .where(and(eq(schema.segments.id, segmentId), eq(schema.segments.dealId, dealId)));
  if (!segment) throw Error("Segment not found");
  await db.transaction(async (tx) => {
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "segment_reclassify_requested",
      entityType: "segment",
      entityId: segment.id,
      maskedAfter: { comment: scrubPayload(comment) },
    });
    await tx
      .insert(schema.intakeReviews)
      .values({
        dealId,
        documentVersionId: segment.documentVersionId,
        segmentId: segment.id,
        type: "classification",
        reason: `Reclassification requested: ${scrubPayload(comment)}`,
      })
      .onConflictDoNothing();
  });
  return segment.documentVersionId;
}
