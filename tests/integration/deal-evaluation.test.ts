import fs from "node:fs";
import { it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun, extractAfterReview } from "@/lib/deals/process";
import { reviewFile, type FilingRecord } from "@/lib/deals/filing";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import { recordAttestation } from "@/lib/evaluation/attestations";
import { requestEvaluation, latestEvaluation, dealCounts, PENDING } from "@/lib/evaluation/run";
import { normalizeValue } from "@/lib/rules/expressions";
import { seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";
import type { documents } from "../../fixtures/lib/truth";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
type Truth = ReturnType<typeof documents>[number];
type Row = { item_id: string; scope_key: string; period: string | null; status: string };
type ExpectedFinding = { rule_id: string; scope_key: string; period: string | null; type: string; severity: string };
const same = (a: unknown, b: unknown) => JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
const sorted = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).sort();
it("Phase 4 Step B: evaluation before and after simulated review equals the authored expectations", async () => {
  process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
  const seed = await seeded();
  const ctx: SessionContext = { user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic administrator" }, workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Synthetic workspace", role: "admin" } };
  const db = getDb();
  const report: Record<string, unknown>[] = [];
  const unlimited = async () => { await getSql()`delete from mutation_limits`; };
  for (const code of ["deal-a", "deal-b", "deal-c"]) {
    const truth = JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/documents.json`, "utf8")) as Truth[];
    const dealJson = JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/deal.json`, "utf8"));
    const dealId = await saveDeal(ctx, { ...dealJson, code: `E-${code}`, name: dealJson.parties.find((p: { roles: string[] }) => p.roles.includes("seller_entity")).legal_name });
    const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
    const external = (id: string) => parties.find((p) => p.id === id)?.externalKey ?? id;
    const internal = (key: string) => parties.find((p) => p.externalKey === key)?.id ?? key;
    // Phase 5 owns the screens; the operator's attestations authored in the plan are recorded through the same API.
    const authored = JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/batch-1/engine_input.json`, "utf8")) as { tracking: { rule_id: string; scope_key: string; state: "received" }[]; manual_confirmations: { rule_id: string; scope_key: string; key: string; confirmed: boolean }[] };
    for (const t of authored.tracking) { await unlimited(); await recordAttestation(ctx, dealId, { kind: "tracking", rule_id: t.rule_id, scope_key: internal(t.scope_key), state: t.state, note: "Receipt recorded for fixture" }); }
    for (const c of authored.manual_confirmations) { await unlimited(); await recordAttestation(ctx, dealId, { kind: "manual_confirmation", rule_id: c.rule_id, scope_key: internal(c.scope_key), key: c.key, confirmed: c.confirmed, note: "Authored fixture confirmation for lender review" }); }
    let previousFindings = 0;
    for (let batch = 1; batch <= (code === "deal-a" ? 2 : 1); batch++) {
      const expectedRows = JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/batch-${batch}/expected_checklist.json`, "utf8")) as Row[];
      const expectedFindings = (JSON.parse(fs.readFileSync(`fixtures/deals/${code}/truth/batch-${batch}/expected_findings.json`, "utf8")) as (ExpectedFinding & { finding_key: string })[]).map(({ rule_id, scope_key, period, type, severity }) => ({ rule_id, scope_key, period, type, severity }));
      const upload = await intake(ctx, dealId, [{ path: `batch-${batch}.zip`, bytes: fs.readFileSync(`fixtures/deals/${code}/batch-${batch}.zip`) }]);
      await processDealRun(ctx, dealId, upload.runId, { sleep: async () => {} });
      // Phase 3 segmentation review: confirm proposed boundaries that match truth.
      for (const arrival of upload.rows.filter((r) => !r.duplicate)) {
        const expected = truth.find((d) => d.file === `incoming/batch-${batch}/${arrival.originalPath}`)!;
        const [record] = await db.select().from(schema.recordVersions).where(and(eq(schema.recordVersions.documentVersionId, arrival.documentVersionId), eq(schema.recordVersions.isCurrent, true)));
        const filed = (record?.payloadJson as FilingRecord | undefined)?.segments ?? [];
        if (!filed.some((s) => s.status === "proposed")) continue;
        const matches = filed.length === expected.segments.length && filed.every((s, i) => s.doc_type === expected.segments[i]!.doc_type && s.page_start === expected.segments[i]!.page_start && s.page_end === expected.segments[i]!.page_end);
        if (!matches) continue;
        await unlimited();
        await reviewFile(ctx, dealId, arrival.documentVersionId, { record_id: record!.id, segments: filed, note: "Confirmed proposed boundaries against the supplied pages." });
        await extractAfterReview(ctx, dealId, arrival.documentVersionId, { sleep: async () => {} });
      }
      const actualRows = async () => {
        const evaluation = (await latestEvaluation(dealId))!;
        const rows = await db.select().from(schema.checklistStatus).where(eq(schema.checklistStatus.evaluationId, evaluation.id));
        const findings = await db.select().from(schema.findings).where(and(eq(schema.findings.dealId, dealId), eq(schema.findings.lastSeenEvaluationId, evaluation.id)));
        return { rows: rows.map((r) => ({ item_id: r.itemId, scope_key: external(r.scopeKey), period: r.period || null, status: r.status })), findings: findings.map((f) => ({ rule_id: f.ruleId, scope_key: external(f.scopeKey), period: f.period, type: f.type, severity: f.severity })) };
      };
      // Before review: nothing is satisfied unless truth says so.
      const before = await actualRows();
      const expectedByKey = new Map(expectedRows.map((r) => [`${r.item_id}|${r.scope_key}|${r.period}`, r.status]));
      const falseSatisfied = before.rows.filter((r) => r.status === "satisfied" && expectedByKey.get(`${r.item_id}|${r.scope_key}|${r.period}`) !== "satisfied");
      expect(falseSatisfied, `${code}/${batch} false satisfied before review`).toEqual([]);
      // Simulated review: resolve every open item with truth values.
      let accepted = 0, edited = 0, rejected = 0, entered = 0, dismissed = 0;
      const pending = await db.select().from(schema.facts).where(and(eq(schema.facts.dealId, dealId), eq(schema.facts.isCurrent, true)));
      for (const f of pending.filter((f) => (PENDING as readonly string[]).includes(f.routingStatus))) {
        const [segment] = await db.select().from(schema.segments).where(eq(schema.segments.id, f.segmentId));
        const version = truth.find((d) => d.segments.some((s) => s.page_start === segment!.pageStart) && d.hash === (upload.rows.find((r) => r.documentVersionId === segment!.documentVersionId)?.contentHash ?? truth.find((t) => t.segments.length && t.file.includes(""))?.hash));
        const truthSegment = version?.segments.find((s) => s.page_start === segment!.pageStart) ?? truth.flatMap((d) => d.segments).find(() => false);
        const truthFact = truthSegment ? version!.facts.find((x) => x.segment_id === truthSegment.id && x.attribute === f.attribute) : undefined;
        await unlimited();
        if (!truthFact) { await reviewFact(ctx, dealId, { fact_id: f.id, expected_record_version: f.recordVersion, action: "reject", comment: "Not stated in the document." }); rejected++; continue; }
        if (same(f.valueJson, truthFact.value)) { await reviewFact(ctx, dealId, { fact_id: f.id, expected_record_version: f.recordVersion, action: "accept", comment: "Matches the page." }); accepted++; }
        else { await reviewFact(ctx, dealId, { fact_id: f.id, expected_record_version: f.recordVersion, action: "edit_accept", value: truthFact.value, comment: "Corrected from the page." }); edited++; }
      }
      for (const gap of await db.select().from(schema.intakeReviews).where(and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open"), eq(schema.intakeReviews.type, "extraction_gap")))) {
        const [segment] = await db.select().from(schema.segments).where(eq(schema.segments.id, gap.segmentId!));
        const hash = upload.rows.find((r) => r.documentVersionId === segment!.documentVersionId)?.contentHash;
        const version = truth.find((d) => d.hash === hash);
        const truthSegment = version?.segments.find((s) => s.page_start === segment!.pageStart);
        const truthFact = truthSegment ? version!.facts.find((x) => x.segment_id === truthSegment.id && x.attribute === gap.attribute) : undefined;
        await unlimited();
        if (!truthFact) { await resolveGap(ctx, dealId, { review_id: gap.id, action: "dismiss", comment: "The document does not state it." }); dismissed++; continue; }
        const value = truthFact.attribute.endsWith("identifier") || truthFact.attribute === "bank.account" ? (truthFact.value as { hmac: string }) : truthFact.value;
        await resolveGap(ctx, dealId, { review_id: gap.id, action: "enter", value: typeof value === "object" && value && "hmac" in value ? value : value, page: truthFact.locator.page, quote: truthFact.locator.quote, comment: "Entered from the page." });
        entered++;
      }
      await requestEvaluation(dealId);
      const after = await actualRows();
      expect(sorted(after.rows), `${code}/${batch} checklist`).toEqual(sorted(expectedRows));
      expect(sorted(after.findings), `${code}/${batch} findings`).toEqual(sorted(expectedFindings));
      const counts = await dealCounts(dealId);
      if (batch === 2) expect(previousFindings - counts.findingsTotal).toBe(3);
      previousFindings = counts.findingsTotal;
      report.push({ deal: code, batch, before_false_satisfied: falseSatisfied.length, review: { accepted, edited, rejected, entered, dismissed }, counts });
    }
    if (code === "deal-b") {
      // A correction creates a new version and a new evaluation whose result changes as expected, then stale writes are rejected.
      const [fact] = await db.select().from(schema.facts).where(and(eq(schema.facts.dealId, dealId), eq(schema.facts.attribute, "financial.revenue"), eq(schema.facts.period, "2024"), eq(schema.facts.isCurrent, true)));
      const start = (await dealCounts(dealId)).findingsTotal;
      await unlimited();
      const v2 = await reviewFact(ctx, dealId, { fact_id: fact!.id, expected_record_version: fact!.recordVersion, action: "edit_accept", value: 1_000_000, comment: "Test correction that disagrees with the return." });
      const [old] = await db.select().from(schema.facts).where(eq(schema.facts.id, fact!.id));
      expect(old!.isCurrent).toBe(false);
      expect(v2.recordVersion).toBe(fact!.recordVersion + 1);
      const changed = await dealCounts(dealId);
      expect(changed.findingsTotal).toBe(start + 1);
      await expect(reviewFact(ctx, dealId, { fact_id: fact!.id, expected_record_version: fact!.recordVersion, action: "accept", comment: "stale" })).rejects.toThrow("Stale");
      await unlimited();
      await reviewFact(ctx, dealId, { fact_id: v2.factId, expected_record_version: v2.recordVersion, action: "edit_accept", value: fact!.valueJson, comment: "Restored from the page." });
      expect((await dealCounts(dealId)).findingsTotal).toBe(start);
      report.push({ deal: code, correction: "pass", stale_write: "pass" });
    }
  }
  fs.writeFileSync("/tmp/acqfile-phase4-step-b-proof.json", JSON.stringify({ report }, null, 2));
}, 900000);
