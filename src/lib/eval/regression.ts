import { REGRESSION_RULES } from "@/lib/config";

export type AggregateMetrics = {
  extraction: { scalar_exact_accuracy: number; list_micro_f1: number; classification_accuracy: number; provenance_validity: number; documents: number; scalar_fields: number; provenance_claims: number; provenance_valid: number; provenance_exact: number; provenance_invalid: number };
  review: { recall: number; precision: number; planted: number; planted_caught: number; routed: number; below_threshold_missing: number; auto_accepted: number; review: number; blocked: number };
  integrity: { duplicate_cases_passed: number; duplicate_cases: number; version_cases_passed: number; version_cases: number; duplicate_records: number; resumability_passed: boolean | null; reprocess_count: number };
  cost: { estimated_cost_usd: number; input_tokens: number; output_tokens: number; latency_p50_ms: number; latency_p95_ms: number };
  cases: { total: number; passed: number; failed: number; by_type: Record<string, { total: number; passed: number }> };
};

export type RegressionCheck = { metric: string; label: string; baseline: number | null; current: number; delta: number | null; threshold: string; passed: boolean };
export type RegressionReport = { passed: boolean; hasBaseline: boolean; baselineEvalRunId: string | null; checks: RegressionCheck[] };

const pp = (x: number) => x * 100;

/** Hard regression rules (spec section 33). */
export function evaluateRegression(current: AggregateMetrics, baseline: AggregateMetrics | null, baselineEvalRunId: string | null): RegressionReport {
  const checks: RegressionCheck[] = [];
  const drop = (metric: string, label: string, cur: number, base: number | null, maxDropPct: number) => {
    const passed = base === null ? true : pp(base) - pp(cur) <= maxDropPct + 1e-9;
    checks.push({ metric, label, baseline: base, current: cur, delta: base === null ? null : cur - base, threshold: `drop <= ${maxDropPct} pp`, passed });
  };
  const flag = (metric: string, label: string, ok: boolean) => checks.push({ metric, label, baseline: null, current: ok ? 1 : 0, delta: null, threshold: "must pass", passed: ok });

  drop("extraction.scalar_exact_accuracy", "Scalar extraction accuracy", current.extraction.scalar_exact_accuracy, baseline?.extraction.scalar_exact_accuracy ?? null, REGRESSION_RULES.extractionExactAccuracyDropPct);
  drop("extraction.provenance_validity", "Provenance validity", current.extraction.provenance_validity, baseline?.extraction.provenance_validity ?? null, REGRESSION_RULES.provenanceValidityDropPct);
  drop("review.recall", "Review recall", current.review.recall, baseline?.review.recall ?? null, REGRESSION_RULES.reviewRecallDropPct);
  flag("integrity.duplicate_detection", "Duplicate detection test", current.integrity.duplicate_cases_passed === current.integrity.duplicate_cases);
  flag("integrity.version_handling", "Corrected-version handling test", current.integrity.version_cases_passed === current.integrity.version_cases);
  flag("integrity.resumability", "Resumability test", current.integrity.resumability_passed === true);
  return { passed: checks.every((c) => c.passed), hasBaseline: baseline !== null, baselineEvalRunId, checks };
}
