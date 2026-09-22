import { checkAttributes } from "@/lib/extract/schema";
import { FACTS } from "@/lib/domain/registry";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { hashObject, stableStringify } from "@/lib/hash";
import { EngineInputSchema, type EngineInput } from "@/lib/rules/input";
import { evaluateDeal } from "@/lib/rules/engine";
import { loadPack } from "@/lib/rules/loader";
import { persistPackSnapshot } from "@/lib/rules/persistence";
import { PartySchema, OwnershipSchema } from "@/lib/domain/profile";
import { FactSchema, SegmentSchema } from "@/lib/domain/evidence";
export const ACCEPTED = ["auto_accepted", "accepted"] as const;
export const PENDING = ["review", "blocked", "needs_source"] as const;
/** Build the engine input from current database rows. Declared ownership wins over an extracted link with the same identity. */
export async function buildEngineInput(
  dealId: string,
): Promise<{ input: EngineInput; deal: typeof schema.deals.$inferSelect }> {
  const db = getDb();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw Error("Deal not found");
  const [parties, links, segments, facts, attestations] = await Promise.all([
    db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId)),
    db.select().from(schema.ownershipLinks).where(eq(schema.ownershipLinks.dealId, dealId)),
    db
      .select()
      .from(schema.segments)
      .where(
        and(
          eq(schema.segments.dealId, dealId),
          eq(schema.segments.isCurrent, true),
          eq(schema.segments.status, "confirmed"),
        ),
      ),
    db
      .select()
      .from(schema.facts)
      .where(and(eq(schema.facts.dealId, dealId), eq(schema.facts.isCurrent, true))),
    db.select().from(schema.attestations).where(eq(schema.attestations.dealId, dealId)),
  ]);
  const segmentIds = new Set(segments.map((s) => s.id));
  const declaredKeys = new Set(
    links
      .filter((l) => l.origin === "declared")
      .map((l) => `${l.ownerPartyId}|${l.ownedPartyId}|${l.stage}`),
  );
  const ownership = links
    .filter(
      (l) =>
        l.origin === "declared" ||
        !declaredKeys.has(`${l.ownerPartyId}|${l.ownedPartyId}|${l.stage}`),
    )
    .map((o) =>
      OwnershipSchema.parse({
        owner_party_id: o.ownerPartyId,
        owned_party_id: o.ownedPartyId,
        percent: o.percent === null ? "unknown" : Number(o.percent),
        stage: o.stage,
        origin: o.origin,
      }),
    );
  const fact = (f: (typeof facts)[number]) =>
    FactSchema.parse({
      id: f.id,
      segment_id: f.segmentId,
      subject_party_id: f.subjectPartyId,
      attribute: f.attribute,
      value: f.valueJson,
      normalized_value: f.normalizedValueJson,
      unit: f.unit,
      period: f.period,
      method: f.method,
      locator: f.locatorJson,
      confidence: Number(f.confidence),
      confidence_components: f.confidenceComponents,
      validators_passed: f.validatorsPassed,
      actor: f.actorId,
      audit_event_id: f.auditEventId,
      record_version: f.recordVersion,
      is_current: f.isCurrent,
    });
  const live = facts.filter((f) => segmentIds.has(f.segmentId) && f.routingStatus !== "rejected");
  const accepted = live
    .filter((f) => (ACCEPTED as readonly string[]).includes(f.routingStatus))
    .map(fact);
  const pending = live
    .filter((f) => (PENDING as readonly string[]).includes(f.routingStatus))
    .map(fact);
  const input = EngineInputSchema.parse({
    profile: deal.profileJson,
    parties: parties.map((p) =>
      PartySchema.parse({
        id: p.id,
        kind: p.kind,
        roles: p.roles,
        legal_name: p.legalName,
        name_variants: p.nameVariants,
        identifier: p.identifierHmac
          ? { hmac: p.identifierHmac, last_four: p.identifierLastFour }
          : null,
        jointly_held_assets: p.jointlyHeldAssets,
        affiliates: p.affiliates,
      }),
    ),
    ownership,
    as_of: deal.asOfDate,
    segments: segments.map((s) =>
      SegmentSchema.parse({
        id: s.id,
        document_version_id: s.documentVersionId,
        file: s.documentVersionId,
        metadata_locator: {
          ...(s.metadataLocator as object),
          quote: (s.metadataLocator as { quote?: string }).quote || "(no quote)",
        },
        page_start: s.pageStart,
        page_end: s.pageEnd,
        doc_type: s.docType,
        party_id: s.partyId,
        period: s.period,
        form_revision: s.formRevision,
        signed: s.signed,
        dated: s.dated,
        signature_date: s.signatureDate,
        document_date: s.documentDate,
        expected_page_count: s.expectedPageCount,
        account_last_four: s.accountLastFour,
        classification_method: s.classificationMethod,
        classification_confidence: Number(s.classificationConfidence),
        status: s.status,
        is_current: s.isCurrent,
      }),
    ),
    accepted_facts: accepted,
    pending_facts: pending,
    tracking: attestations
      .filter((a) => a.kind === "tracking")
      .map((a) => ({
        rule_id: a.ruleId,
        scope_key: a.scopeKey,
        state: a.state!,
        actor: a.actorId,
        note: a.note,
      })),
    manual_confirmations: attestations
      .filter((a) => a.kind === "manual_confirmation")
      .map((a) => ({
        rule_id: a.ruleId,
        scope_key: a.scopeKey,
        period: a.period || null,
        key: a.key,
        confirmed: !!a.confirmed,
        actor: a.actorId,
        note: a.note,
        audit_event_id: a.auditEventId,
      })),
    waivers: attestations
      .filter((a) => a.kind === "waiver")
      .map((a) => ({
        rule_id: a.ruleId,
        scope_key: a.scopeKey,
        period: a.period || null,
        actor: a.actorId,
        note: a.note,
        audit_event_id: a.auditEventId,
      })),
    evidence_inventory: {
      segment_ids: segments.map((s) => s.id),
      fact_ids: [...accepted, ...pending].map((f) => f.id),
    },
  });
  return { input, deal };
}
/** Stable across database row ordering; includes revisions, pending values and provenance. */
export function engineInputHash(input: EngineInput) {
  const ordered = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? [...value].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
        : key === "evidence_inventory"
          ? {
              segment_ids: [...input.evidence_inventory.segment_ids].sort(),
              fact_ids: [...input.evidence_inventory.fact_ids].sort(),
            }
          : value,
    ]),
  );
  return hashObject(ordered);
}
/** Evaluate a deal from the database and persist the evaluation, checklist rows and findings. */
export async function evaluateDealNow(dealId: string) {
  const { input, deal } = await buildEngineInput(dealId);
  if (deal.rulePackVersion === "unknown") return null;
  const pack = loadPack(deal.rulePackVersion, deal.overlayId ?? undefined);
  const started = Date.now();
  const result = evaluateDeal(input, pack);
  const snapshot = await persistPackSnapshot(pack);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [evaluation] = await tx
      .insert(schema.evaluations)
      .values({
        dealId,
        rulePackHash: snapshot!.contentHash,
        factsHash: hashObject(input.accepted_facts.map((f) => [f.id, f.normalized_value])),
        inputHash: engineInputHash(input),
        resultHash: result.result_hash,
        durationMs: Date.now() - started,
        asOfDate: input.as_of,
      })
      .returning();
    if (result.checklist.length)
      await tx.insert(schema.checklistStatus).values(
        result.checklist.map((r) => ({
          evaluationId: evaluation!.id,
          itemId: r.item_id,
          scopeKey: r.scope_key,
          period: r.period ?? "",
          status: r.status,
          satisfyingSegmentIds: r.segment_ids,
          reasonsJson: r.reasons,
        })),
      );
    // A50: missing facts are derived from each applicable row's checks, across its accepted types.
    for (const row of result.checklist.filter(
      (r) => !["not_applicable", "waived", "missing"].includes(r.status),
    )) {
      const rule = pack.items.find((r) => r.id === row.item_id);
      if (!rule) continue;
      const attributes = new Set<string>();
      rule.checks.forEach((c) => checkAttributes(c, attributes));
      const rowSegments = input.segments.filter((s) => row.segment_ids.includes(s.id));
      for (const attribute of attributes) {
        if (
          [...input.accepted_facts, ...input.pending_facts].some(
            (f) => row.segment_ids.includes(f.segment_id) && f.attribute === attribute,
          )
        )
          continue;
        const segment = rowSegments.find((s) =>
          FACTS[attribute as keyof typeof FACTS]?.producers.includes(s.doc_type),
        );
        if (!segment) continue;
        await tx
          .insert(schema.intakeReviews)
          .values({
            dealId,
            documentVersionId: segment.document_version_id,
            segmentId: segment.id,
            attribute,
            type: "extraction_gap",
            reason: `${row.item_id} requires ${attribute}; the current document has no extracted value.`,
          })
          .onConflictDoNothing();
      }
    }
    const existing = await tx
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.dealId, dealId));
    const byKey = new Map(existing.map((f) => [f.findingKey, f]));
    for (const f of result.findings) {
      const prior = byKey.get(f.finding_key);
      const details = { message: f.message, details: f.details };
      // A48: a finding that returns reopens; dismissed and waived decisions stand until the owner changes them.
      const reopen = prior && prior.status === "resolved";
      await tx
        .insert(schema.findings)
        .values({
          dealId,
          findingKey: f.finding_key,
          ruleId: f.rule_id,
          type: f.type,
          severity: f.severity,
          scopeKey: f.scope_key,
          period: f.period,
          detailsJson: details,
          responsibleRole: f.responsible,
          firstSeenEvaluationId: evaluation!.id,
          lastSeenEvaluationId: evaluation!.id,
        })
        .onConflictDoUpdate({
          target: [schema.findings.dealId, schema.findings.findingKey],
          set: {
            lastSeenEvaluationId: evaluation!.id,
            type: f.type,
            severity: f.severity,
            detailsJson: details,
            ...(reopen
              ? { status: "open", resolvedAt: null, resolvedByJson: null, resolutionNote: null }
              : {}),
          },
        });
    }
    // A48: the system resolves a finding when its condition disappears and records what resolved it.
    const raised = new Set(result.findings.map((f) => f.finding_key));
    const gone = existing.filter(
      (f) => !raised.has(f.findingKey) && ["open", "requested"].includes(f.status),
    );
    if (gone.length) {
      for (const f of gone) {
        const row = result.checklist.find(
          (r) => r.item_id === f.ruleId && r.scope_key === f.scopeKey && r.period === f.period,
        );
        const segmentIds =
          row?.segment_ids ??
          input.segments
            .filter((s) => s.party_id === f.scopeKey || f.scopeKey === "deal")
            .map((s) => s.id);
        const resolvedBy = {
          segment_ids: segmentIds,
          fact_ids: input.accepted_facts
            .filter((x) => segmentIds.includes(x.segment_id))
            .map((x) => x.id),
          evaluation_id: evaluation!.id,
        };
        await tx
          .update(schema.findings)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            resolvedByJson: resolvedBy,
            resolutionNote: "The condition no longer holds with the cited current evidence.",
          })
          .where(eq(schema.findings.id, f.id));
        await tx.insert(schema.events).values({
          dealId,
          actorId: (
            await tx.select().from(schema.events).where(eq(schema.events.dealId, dealId)).limit(1)
          )[0]!.actorId,
          action: "finding_resolved",
          entityType: "finding",
          entityId: f.id,
          maskedAfter: resolvedBy,
        });
      }
    }
    return { evaluationId: evaluation!.id, result };
  });
}
const inflight = new Map<string, Promise<void>>();
const dirty = new Set<string>();
/** Debounced evaluation: concurrent requests for one deal coalesce into one run plus at most one follow-up. */
export function requestEvaluation(dealId: string): Promise<void> {
  const running = inflight.get(dealId);
  if (running) {
    dirty.add(dealId);
    return running;
  }
  const p = (async () => {
    do {
      dirty.delete(dealId);
      await evaluateDealNow(dealId);
    } while (dirty.has(dealId));
  })().finally(() => inflight.delete(dealId));
  inflight.set(dealId, p);
  return p;
}
export async function latestEvaluation(dealId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.evaluations)
    .where(eq(schema.evaluations.dealId, dealId))
    .orderBy(sql`${schema.evaluations.createdAt} desc`)
    .limit(1);
  return row ?? null;
}
/** Counts only (checklist and findings screens are Phase 5). */
export async function dealCounts(dealId: string) {
  const db = getDb();
  const evaluation = await latestEvaluation(dealId);
  const checklist: Record<string, number> = {},
    findings: Record<string, number> = {},
    findingsByType: Record<string, number> = {};
  let findingsTotal = 0;
  if (evaluation) {
    for (const r of await db
      .select()
      .from(schema.checklistStatus)
      .where(eq(schema.checklistStatus.evaluationId, evaluation.id)))
      checklist[r.status] = (checklist[r.status] ?? 0) + 1;
    for (const f of await db
      .select()
      .from(schema.findings)
      .where(
        and(
          eq(schema.findings.dealId, dealId),
          eq(schema.findings.lastSeenEvaluationId, evaluation.id),
        ),
      )) {
      findings[f.severity] = (findings[f.severity] ?? 0) + 1;
      findingsByType[f.type] = (findingsByType[f.type] ?? 0) + 1;
      findingsTotal++;
    }
  }
  const pending = await db
    .select({ segmentId: schema.facts.segmentId })
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.isCurrent, true),
        inArray(schema.facts.routingStatus, [...PENDING]),
      ),
    );
  const reviews = await db
    .select()
    .from(schema.intakeReviews)
    .where(and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open")));
  return {
    evaluatedAt: evaluation?.createdAt ?? null,
    checklist,
    findings,
    findingsByType,
    findingsTotal,
    pendingFacts: pending.length,
    openReviews: reviews.length,
    segmentsWithPendingFacts: new Set(pending.map((p) => p.segmentId)).size,
  };
}
