import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Db } from "@/lib/db/client";
import { TAXONOMY } from "@/lib/domain/registry";
import { assertMutation } from "@/lib/access";
import type { SessionContext } from "@/lib/workspace";
import { requireDeal } from "./service";
import {
  CandidateSchema,
  validateBoundaries,
  type Classified,
} from "./classification";
import { scrubPayload } from "./identifiers";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Filed = Classified & { id: string };
export type FilingRecord = {
  segments: Filed[];
  manual_filing?: { doc_type: string; party_id: string | null; note: string };
};
async function supersede(
  tx: Tx,
  context: SessionContext,
  dealId: string,
  newId: string,
  c: Classified,
  force = false,
) {
  if (
    c.status !== "confirmed" ||
    !c.party_id ||
    !TAXONOMY.find((t) => t.id === c.doc_type)?.single_instance
  )
    return;
  const current = await tx
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.dealId, dealId),
        eq(schema.segments.docType, c.doc_type),
        eq(schema.segments.partyId, c.party_id),
        eq(schema.segments.isCurrent, true),
        eq(schema.segments.status, "confirmed"),
      ),
    );
  for (const old of current.filter(
    (s) =>
      s.id !== newId &&
      s.period === c.period &&
      s.accountLastFour === c.account_last_four,
  )) {
    // A32 with A36: a dated submission is strictly later than a current one that carries no date at all.
    const later = !!(
      (c.document_date &&
        old.documentDate &&
        c.document_date > old.documentDate) ||
      (c.signature_date &&
        old.signatureDate &&
        c.signature_date > old.signatureDate) ||
      ((c.document_date || c.signature_date) &&
        !old.documentDate &&
        !old.signatureDate)
    );
    if (later || force) {
      await tx
        .update(schema.segments)
        .set({ isCurrent: false })
        .where(eq(schema.segments.id, old.id));
      await tx.insert(schema.events).values({
        dealId,
        actorId: context.user.id,
        action: force ? "version_selected" : "segment_superseded",
        entityType: "segment",
        entityId: newId,
        maskedBefore: { segmentId: old.id },
        maskedAfter: { segmentId: newId },
      });
    } else {
      c.status = "proposed";
      await tx
        .insert(schema.intakeReviews)
        .values({
          dealId,
          documentVersionId: (
            await tx
              .select()
              .from(schema.segments)
              .where(eq(schema.segments.id, newId))
          )[0]!.documentVersionId,
          type: "version_conflict",
          reason:
            "Another current segment has the same identity without a strictly earlier date.",
        })
        .onConflictDoNothing();
      await tx
        .update(schema.segments)
        .set({ status: "proposed" })
        .where(eq(schema.segments.id, newId));
    }
  }
}
async function writeSegments(
  tx: Tx,
  context: SessionContext,
  dealId: string,
  versionId: string,
  candidates: Classified[],
  force = false,
) {
  const result: Filed[] = [];
  for (const original of candidates) {
    const c = scrubPayload(structuredClone(original)),
      id = randomUUID();
    await tx.insert(schema.segments).values({
      id,
      dealId,
      documentVersionId: versionId,
      metadataLocator: {
        file: versionId,
        page: c.quote_page,
        source_block: `page-${c.quote_page}`,
        quote: c.quote,
      },
      pageStart: c.page_start,
      pageEnd: c.page_end,
      docType: c.doc_type,
      partyId: c.party_id,
      period: c.period,
      formRevision: c.form_revision,
      signed: c.signed,
      dated: c.dated,
      signatureDate: c.signature_date,
      documentDate: c.document_date,
      expectedPageCount: c.expected_page_count,
      accountLastFour: c.account_last_four,
      classificationMethod: c.classification_method,
      classificationConfidence: c.classification_method === "llm" ? "0" : "1",
      status: c.status,
    });
    await supersede(tx, context, dealId, id, c, force);
    result.push({ ...c, id });
  }
  return result;
}
export async function finalizeSegments(
  context: SessionContext,
  dealId: string,
  versionId: string,
  candidates: Classified[],
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`,
    );
    const [existing] = await tx
      .select()
      .from(schema.recordVersions)
      .where(
        and(
          eq(schema.recordVersions.documentVersionId, versionId),
          eq(schema.recordVersions.isCurrent, true),
        ),
      );
    if (existing) return existing.payloadJson as FilingRecord;
    const segments = await writeSegments(
      tx,
      context,
      dealId,
      versionId,
      candidates,
    );
    const payload: FilingRecord = { segments };
    const [record] = await tx
      .insert(schema.recordVersions)
      .values({
        documentVersionId: versionId,
        versionNumber: 1,
        createdByType: "model",
        payloadJson: payload,
      })
      .returning();
    const reviews = new Set<string>();
    if (segments.length > 1) reviews.add("segmentation");
    if (
      segments.some((s) => s.status === "proposed") &&
      segments.length === 1 &&
      segments.every((s) => !s.uncertain && s.assignment === "matched")
    )
      reviews.add("version_conflict");
    if (segments.some((s) => s.uncertain)) reviews.add("classification");
    if (segments.some((s) => s.assignment !== "matched"))
      reviews.add("party_assignment");
    for (const type of reviews)
      await tx
        .insert(schema.intakeReviews)
        .values({
          dealId,
          documentVersionId: versionId,
          recordVersionId: record!.id,
          type,
          reason:
            type === "party_assignment"
              ? "Party is outside the deal, unknown or ambiguous."
              : "Confirm the proposed document boundaries and metadata.",
        })
        .onConflictDoNothing();
    await tx
      .update(schema.documentVersions)
      .set({
        processingStatus: reviews.size ? "completed_with_review" : "completed",
      })
      .where(eq(schema.documentVersions.id, versionId));
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "segments_finalized",
      entityType: "document_version",
      entityId: versionId,
      maskedAfter: { recordId: record!.id, segments: segments.length },
    });
    return payload;
  });
}
const ReviewSchema = z.object({
  record_id: z.uuid().nullable(),
  segments: z.array(CandidateSchema.extend({ party_id: z.uuid().nullable() })),
  note: z.string().min(1).max(1000),
  manual_filing: z.boolean().default(false),
  force_current: z.boolean().default(false),
});
export async function reviewFile(
  context: SessionContext,
  dealId: string,
  versionId: string,
  raw: unknown,
) {
  await assertMutation(context, "deal-review");
  await requireDeal(context, dealId);
  const input = ReviewSchema.parse(scrubPayload(raw));
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`,
    );
    const [version] = await tx
      .select()
      .from(schema.documentVersions)
      .where(
        and(
          eq(schema.documentVersions.id, versionId),
          eq(schema.documentVersions.dealId, dealId),
        ),
      );
    if (!version) throw Error("File not found");
    const [current] = await tx
      .select()
      .from(schema.recordVersions)
      .where(
        and(
          eq(schema.recordVersions.documentVersionId, versionId),
          eq(schema.recordVersions.isCurrent, true),
        ),
      );
    if ((current?.id ?? null) !== input.record_id)
      throw Error("Stale edit. Reload the file before saving.");
    const partyIds = (
      await tx
        .select()
        .from(schema.parties)
        .where(eq(schema.parties.dealId, dealId))
    ).map((p) => p.id);
    if (
      input.segments.some((s) => s.party_id && !partyIds.includes(s.party_id))
    )
      throw Error("Party belongs to another deal");
    const unreadable = version.parseStatus === "failed";
    if (unreadable && !input.manual_filing)
      throw Error("Unreadable files can only be manually indexed");
    if (!unreadable) validateBoundaries(input.segments, version.pageCount ?? 1);
    if (unreadable && input.segments.length !== 1)
      throw Error("Choose one manual filing type");
    if (current)
      await tx
        .update(schema.recordVersions)
        .set({ isCurrent: false })
        .where(eq(schema.recordVersions.id, current.id));
    await tx
      .update(schema.segments)
      .set({ isCurrent: false })
      .where(eq(schema.segments.documentVersionId, versionId));
    // Facts of replaced segments are no longer current; reprocessing supersedes old pending items.
    await tx
      .update(schema.facts)
      .set({ isCurrent: false })
      .where(
        and(
          eq(schema.facts.documentVersionId, versionId),
          eq(schema.facts.isCurrent, true),
        ),
      );
    await tx
      .update(schema.intakeReviews)
      .set({ status: "resolved" })
      .where(
        and(
          eq(schema.intakeReviews.documentVersionId, versionId),
          eq(schema.intakeReviews.status, "open"),
        ),
      );
    const segments = unreadable
      ? []
      : await writeSegments(
          tx,
          context,
          dealId,
          versionId,
          input.segments.map((s) => ({
            ...s,
            classification_method: "manual",
            assignment: s.party_id ? "matched" : "outside",
            status: "confirmed",
          })),
          input.force_current,
        );
    const payload: FilingRecord = {
      segments,
      ...(unreadable
        ? {
            manual_filing: {
              doc_type: input.segments[0]!.doc_type,
              party_id: input.segments[0]!.party_id,
              note: input.note,
            },
          }
        : {}),
    };
    const [record] = await tx
      .insert(schema.recordVersions)
      .values({
        documentVersionId: versionId,
        parentRecordVersionId: current?.id,
        versionNumber: (current?.versionNumber ?? 0) + 1,
        createdByType: "reviewer",
        createdByUserId: context.user.id,
        payloadJson: payload,
        changedFields: ["segments"],
      })
      .returning();
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: unreadable ? "unreadable_manually_filed" : "segments_reviewed",
      entityType: "document_version",
      entityId: versionId,
      maskedBefore: { recordId: current?.id ?? null },
      maskedAfter: { recordId: record!.id, note: input.note },
    });
    return record!.id;
  });
}
export async function undoSupersession(
  context: SessionContext,
  dealId: string,
  eventId: string,
) {
  await assertMutation(context, "deal-review");
  await requireDeal(context, dealId);
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`,
    );
    const [event] = await tx
      .select()
      .from(schema.events)
      .where(
        and(eq(schema.events.id, eventId), eq(schema.events.dealId, dealId)),
      );
    if (
      !event ||
      !["segment_superseded", "version_selected"].includes(event.action)
    )
      throw Error("Supersession event not found");
    const oldId = (event.maskedBefore as { segmentId: string }).segmentId,
      newId = (event.maskedAfter as { segmentId: string }).segmentId;
    const [current] = await tx
      .select()
      .from(schema.segments)
      .where(
        and(eq(schema.segments.id, newId), eq(schema.segments.isCurrent, true)),
      );
    const [old] = await tx
      .select()
      .from(schema.segments)
      .where(
        and(
          eq(schema.segments.id, oldId),
          eq(schema.segments.isCurrent, false),
        ),
      );
    if (!current || !old)
      throw Error("Stale supersession. Reload before undoing.");
    for (const segment of [current, old]) {
      const [record] = await tx
        .select()
        .from(schema.recordVersions)
        .where(
          and(
            eq(
              schema.recordVersions.documentVersionId,
              segment.documentVersionId,
            ),
            eq(schema.recordVersions.isCurrent, true),
          ),
        );
      if (
        !(record?.payloadJson as FilingRecord | undefined)?.segments.some(
          (s) => s.id === segment.id,
        )
      )
        throw Error("Stale supersession. A document has since been reviewed.");
    }
    await tx
      .update(schema.segments)
      .set({ isCurrent: false })
      .where(eq(schema.segments.id, newId));
    await tx
      .update(schema.segments)
      .set({ isCurrent: true })
      .where(eq(schema.segments.id, oldId));
    await tx.insert(schema.events).values({
      dealId,
      actorId: context.user.id,
      action: "supersession_undone",
      entityType: "segment",
      entityId: oldId,
      maskedBefore: { segmentId: newId },
      maskedAfter: { segmentId: oldId, eventId },
    });
  });
}
