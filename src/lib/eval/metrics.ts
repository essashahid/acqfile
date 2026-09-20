import { tokenize } from "@/lib/text";
/** Generic evaluation metrics kept for the Phase 6 harness. Report-schema comparisons were retired under A42. */
export type ListComparison = { field: string; tp: number; fp: number; fn: number };
export function tokenF1(a: string, b: string): number {
  const at = tokenize(a);
  const bt = tokenize(b);
  if (at.length === 0 || bt.length === 0) return 0;
  const bset = new Set(bt);
  const overlap = at.filter((t) => bset.has(t)).length;
  const p = overlap / bt.length;
  const r = overlap / at.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
export function microF1(comparisons: ListComparison[]): { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number } {
  const tp = comparisons.reduce((n, c) => n + c.tp, 0);
  const fp = comparisons.reduce((n, c) => n + c.fp, 0);
  const fn = comparisons.reduce((n, c) => n + c.fn, 0);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
