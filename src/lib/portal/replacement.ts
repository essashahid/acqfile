import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { reviewFile, undoSupersession, type FilingRecord } from "@/lib/deals/filing";
import { extractAfterReview } from "@/lib/deals/process";
import { requestEvaluation } from "@/lib/evaluation/run";
import type { PortalAccess } from "./service";
/** Selection is a presentation action. Existing filing APIs retain identity and audit checks. */
export async function replaceSelected(access: PortalAccess, selected: string, incoming: string[]) {
  const db = getDb(),
    dealId = access.deal.id;
  const segments = await db
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "segment_superseded")));
  // A replacement must not retire a different period/account just because it was uploaded later.
  for (const event of events) {
    const old = segments.find(
      (s) => s.id === (event.maskedBefore as { segmentId: string }).segmentId,
    );
    const fresh = segments.find((s) => s.id === event.entityId);
    if (
      old &&
      fresh &&
      incoming.includes(fresh.documentVersionId) &&
      old.documentVersionId !== selected &&
      fresh.isCurrent &&
      !old.isCurrent
    )
      await undoSupersession(access.ctx, dealId, event.id);
  }
  const old = segments.filter((s) => s.documentVersionId === selected);
  for (const version of incoming.filter((v) => v !== selected)) {
    const [record] = await db
      .select()
      .from(schema.recordVersions)
      .where(
        and(
          eq(schema.recordVersions.documentVersionId, version),
          eq(schema.recordVersions.isCurrent, true),
        ),
      );
    const candidates = (record?.payloadJson as FilingRecord | undefined)?.segments ?? [];
    // Uncertain, bundled, different-person and different-period files stay with staff.
    if (old.length !== 1 || candidates.length !== 1) continue;
    const before = old[0]!,
      after = candidates[0]!;
    if (
      after.classification_method !== "signature" ||
      after.uncertain ||
      after.assignment !== "matched" ||
      after.party_id !== access.party.id ||
      before.partyId !== after.party_id ||
      before.docType !== after.doc_type ||
      before.period !== after.period ||
      before.accountLastFour !== after.account_last_four
    )
      continue;
    if (
      segments.some(
        (s) =>
          s.isCurrent &&
          ![selected, version].includes(s.documentVersionId) &&
          s.partyId === before.partyId &&
          s.docType === before.docType &&
          s.period === before.period &&
          s.accountLastFour === before.accountLastFour,
      )
    )
      continue;
    if (!before.isCurrent) continue; // The ordinary dated supersession already did exactly this.
    await reviewFile(access.ctx, dealId, version, {
      record_id: record!.id,
      segments: candidates,
      note: "The sender selected this file as the replacement for their earlier copy.",
      force_current: true,
    });
    await extractAfterReview(access.ctx, dealId, version);
  }
  await requestEvaluation(dealId);
}

/** A personal link authorizes one task, not a staff-style batch for the whole deal. */
export async function isolateSubmission(
  access: PortalAccess,
  task: import("./map").Task,
  incoming: string[],
) {
  const db = getDb(),
    dealId = access.deal.id;
  const segments = await db
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  const allowedIds = new Set(task.rows.flatMap((r) => r.segments.map((s) => s.id)));
  const allowedParties = new Set([
    access.party.id,
    ...segments.filter((s) => allowedIds.has(s.id)).map((s) => s.partyId),
  ]);
  const allowed = (s: { doc_type: string; party_id: string | null; period: string | null }) =>
    task.accepted.includes(s.doc_type) &&
    allowedParties.has(s.party_id) &&
    (!task.periods.some(Boolean) || task.periods.includes(s.period ?? ""));
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "segment_superseded")));
  for (const event of events) {
    const old = segments.find(
        (s) => s.id === (event.maskedBefore as { segmentId: string }).segmentId,
      ),
      fresh = segments.find((s) => s.id === event.entityId);
    if (
      old &&
      fresh &&
      incoming.includes(fresh.documentVersionId) &&
      !allowedIds.has(old.id) &&
      fresh.isCurrent &&
      !old.isCurrent
    )
      await undoSupersession(access.ctx, dealId, event.id);
  }
  for (const version of incoming) {
    const [record] = await db
      .select()
      .from(schema.recordVersions)
      .where(
        and(
          eq(schema.recordVersions.documentVersionId, version),
          eq(schema.recordVersions.isCurrent, true),
        ),
      );
    const candidates = (record?.payloadJson as FilingRecord | undefined)?.segments ?? [];
    if (!candidates.some((s) => !allowed(s))) continue;
    await reviewFile(access.ctx, dealId, version, {
      record_id: record!.id,
      segments: candidates.map((s) =>
        allowed(s) ? s : { ...s, party_id: null, doc_type: "OTHER_NOT_REQUIRED" },
      ),
      note: "Personal-link submission is outside its assigned task; retained for staff to place, without changing another person's evidence.",
    });
    await db
      .insert(schema.intakeReviews)
      .values({
        dealId,
        documentVersionId: version,
        type: "classification",
        reason:
          "Personal-link submission needs staff placement. Read the original and the preceding metadata before assigning it.",
      })
      .onConflictDoNothing();
  }
  await requestEvaluation(dealId);
}
