import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { saveDeal, requireDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun, extractAfterReview } from "@/lib/deals/process";
import { reviewFile, type FilingRecord } from "@/lib/deals/filing";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import { recordAttestation } from "@/lib/evaluation/attestations";
import { PENDING, requestEvaluation, latestEvaluation } from "@/lib/evaluation/run";
import { normalizeValue } from "@/lib/rules/expressions";
import type { SessionContext } from "@/lib/workspace";
import type { documents } from "../../fixtures/lib/truth";
export const readTruth = (code: string, name: string) =>
  JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/${name}.json`, "utf8"));
export const unlimited = async () => {
  await getSql()`delete from mutation_limits`;
};
export const equalValue = (a: unknown, b: unknown) =>
  JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
export async function fixtureDeal(ctx: SessionContext, code: string, prefix = "Proof") {
  const draft = readTruth(code, "deal");
  const id = await saveDeal(ctx, {
    ...draft,
    code: `${prefix}-${code}`,
    name: draft.parties.find((p: { roles: string[] }) => p.roles.includes("seller_entity"))
      .legal_name,
  });
  const parties = await getDb().select().from(schema.parties).where(eq(schema.parties.dealId, id));
  return {
    id,
    code,
    truth: readTruth(code, "documents") as ReturnType<typeof documents>,
    external: (key: string) => parties.find((p) => p.id === key)?.externalKey ?? key,
    internal: (key: string) => parties.find((p) => p.externalKey === key)?.id ?? key,
  };
}
export type FixtureDeal = Awaited<ReturnType<typeof fixtureDeal>>;
export async function attestTruth(
  ctx: SessionContext,
  d: FixtureDeal,
  batch: number,
  excludeCitizenship = false,
) {
  const input = readTruth(d.code, `batch-${batch}/engine_input`);
  for (const t of input.tracking) {
    await unlimited();
    await recordAttestation(ctx, d.id, {
      ...t,
      kind: "tracking",
      scope_key: d.internal(t.scope_key),
      note: "Authored fixture receipt",
    });
  }
  for (const c of input.manual_confirmations) {
    if (excludeCitizenship && c.rule_id === "GUA-05" && c.scope_key === "bea") continue;
    await unlimited();
    await recordAttestation(ctx, d.id, {
      ...c,
      kind: "manual_confirmation",
      scope_key: d.internal(c.scope_key),
      note: "Authored fixture confirmation for lender review",
    });
  }
}
export async function uploadFixture(ctx: SessionContext, d: FixtureDeal, batch: number) {
  const authored = readTruth(d.code, `batch-${batch}/engine_input`);
  const deal = await requireDeal(ctx, d.id);
  if (batch > 1 && d.code === "deal-b") {
    await unlimited();
    await saveDeal(
      ctx,
      { ...readTruth(d.code, "deal"), code: deal.code, name: deal.name, profile: authored.profile },
      d.id,
      deal.revision,
    );
  }

  await unlimited();
  const upload = await intake(ctx, d.id, [
    {
      path: `batch-${batch}.zip`,
      bytes: fs.readFileSync(`fixtures/deals/${d.code}/batch-${batch}.zip`),
    },
  ]);
  await processDealRun(ctx, d.id, upload.runId, { sleep: async () => {} });
  return upload;
}
export async function confirmBoundaries(ctx: SessionContext, d: FixtureDeal) {
  const db = getDb();
  const versions = await db
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, d.id));
  for (const version of versions) {
    const [record] = await db
      .select()
      .from(schema.recordVersions)
      .where(
        and(
          eq(schema.recordVersions.documentVersionId, version.id),
          eq(schema.recordVersions.isCurrent, true),
        ),
      );
    const filed = (record?.payloadJson as FilingRecord | undefined)?.segments ?? [];
    const expected = d.truth.find((t) => t.hash === version.contentHash);
    if (!expected || !expected.segments.length) continue;
    const agrees =
      filed.length === expected.segments.length &&
      filed.every((s, i) => {
        const t = expected.segments[i]!;
        return (
          s.status === "confirmed" &&
          s.doc_type === t.doc_type &&
          s.page_start === t.page_start &&
          s.page_end === t.page_end &&
          s.period === t.period &&
          s.signed === t.signed &&
          s.dated === t.dated &&
          s.party_id === (t.party_id === "outside-party" ? null : d.internal(t.party_id!))
        );
      });
    if (agrees) continue;
    // Truth is the simulated operator, not the parser's expected result.
    const candidates = expected.segments.map((t) => ({
      ...(filed.find((s) => s.page_start === t.page_start) ?? filed[0]!),
      page_start: t.page_start,
      page_end: t.page_end,
      doc_type: t.doc_type,
      party_id: t.party_id === "outside-party" ? null : d.internal(t.party_id!),
      period: t.period,
      signed: t.signed,
      dated: t.dated,
      signature_date: t.signature_date,
      document_date: t.document_date,
    }));
    await unlimited();
    await reviewFile(ctx, d.id, version.id, {
      record_id: record!.id,
      segments: candidates,
      note: "Confirmed boundaries from the supplied pages",
    });
    await extractAfterReview(ctx, d.id, version.id, { sleep: async () => {} });
  }
}
export async function reviewTruth(ctx: SessionContext, d: FixtureDeal) {
  const db = getDb();
  const segments = await db
    .select()
    .from(schema.segments)
    .where(and(eq(schema.segments.dealId, d.id), eq(schema.segments.isCurrent, true)));
  const versions = await db
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, d.id));
  const expected = (segmentId: string, attribute: string) => {
    const s = segments.find((x) => x.id === segmentId);
    const v = d.truth.find(
      (x) => x.hash === versions.find((v) => v.id === s?.documentVersionId)?.contentHash,
    );
    const t = v?.segments.find((t) => t.page_start === s?.pageStart);
    return v?.facts.find((f) => f.segment_id === t?.id && f.attribute === attribute);
  };
  for (const f of await db
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.dealId, d.id), eq(schema.facts.isCurrent, true)))) {
    if (
      !(PENDING as readonly string[]).includes(f.routingStatus) ||
      !segments.some((s) => s.id === f.segmentId && s.isCurrent && s.status === "confirmed")
    )
      continue;
    const t = expected(f.segmentId, f.attribute);
    await unlimited();
    await reviewFact(ctx, d.id, {
      fact_id: f.id,
      expected_record_version: f.recordVersion,
      action: !t ? "reject" : "edit_accept",
      ...(t ? { value: t.value, source: truthSource(t) } : {}),
      comment: "Compared with supplied source",
    });
  }
  for (const gap of await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.dealId, d.id),
        eq(schema.intakeReviews.type, "extraction_gap"),
        eq(schema.intakeReviews.status, "open"),
      ),
    )) {
    const t = expected(gap.segmentId!, gap.attribute!);
    await unlimited();
    await resolveGap(ctx, d.id, {
      review_id: gap.id,
      action: t ? "enter" : "dismiss",
      ...(t ? { value: t.value, source: truthSource(t) } : {}),
      comment: t ? "Entered from source" : "Not stated in the source",
    });
  }
  await requestEvaluation(d.id);
}
export async function currentResult(d: FixtureDeal) {
  const db = getDb(),
    ev = (await latestEvaluation(d.id))!;
  return {
    evaluation: ev,
    rows: (
      await db
        .select()
        .from(schema.checklistStatus)
        .where(eq(schema.checklistStatus.evaluationId, ev.id))
    ).map((r) => ({
      item_id: r.itemId,
      scope_key: d.external(r.scopeKey),
      period: r.period || null,
      status: r.status,
    })),
    findings: (
      await db
        .select()
        .from(schema.findings)
        .where(
          and(eq(schema.findings.dealId, d.id), eq(schema.findings.lastSeenEvaluationId, ev.id)),
        )
    ).map((f) => ({
      rule_id: f.ruleId,
      scope_key: d.external(f.scopeKey),
      period: f.period,
      type: f.type,
      severity: f.severity,
    })),
  };
}

/** The fixture operator reads the authored source, including explicitly labelled image transcriptions. */
export function truthSource(t: {
  method: string;
  attribute: string;
  locator: { page: number; quote: string; region?: string; verbatim?: boolean };
}) {
  return {
    page: t.locator.page,
    quote: t.locator.quote,
    kind:
      t.method === "vision" || t.locator.verbatim === false
        ? ("transcription" as const)
        : ("quote" as const),
    region: t.locator.region ?? t.attribute,
  };
}
