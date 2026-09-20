import { stableStringify } from "@/lib/hash";
import type { Expr } from "./schema";
export const UNKNOWN = Symbol("unknown");
export type Value = unknown | typeof UNKNOWN;
export type Truth = "pass" | "fail" | "unknown";
export function truth(v: Value): Truth { return v === true ? "pass" : v === false ? "fail" : "unknown"; }
export function allTruth(values: Truth[]): Truth { return values.includes("fail") ? "fail" : values.includes("unknown") ? "unknown" : "pass"; }
export const daysBetween = (a: string, b: string) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
export function addDays(a: string, n: number) { return new Date(Date.parse(a + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
export function addYears(a: string, n: number) {
  const [y = 0, m = 1, d = 1] = a.split("-").map(Number);
  const end = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + n, m - 1, Math.min(d, end))).toISOString().slice(0, 10);
}
export function normalizeName(v: string) { return v.normalize("NFKC").toLowerCase().replace(/\bl\.?l\.?c\.?\b/g, " ").replace(/\b(incorporated|inc|limited|ltd|corporation|corp|llc)\b/g, " ").replace(/[^a-z0-9]/g, ""); }
export function normalizeValue(v: unknown): unknown {
  if (typeof v === "string") return normalizeName(v);
  if (Array.isArray(v)) return v.map(normalizeValue).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (v && typeof v === "object") { const o = v as Record<string, unknown>; if ("hmac" in o) return o.hmac; return Object.fromEntries(Object.entries(o).filter(([k]) => k !== "title").map(([k, a]) => [k, normalizeValue(a)])); }
  return v;
}
export function equal(a: unknown, b: unknown, tolerance = 0) { return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= tolerance + 1e-9 : stableStringify(normalizeValue(a)) === stableStringify(normalizeValue(b)); }
export type Resolve = (ref: Exclude<Expr, string | number | boolean | null | unknown[] | { op: string; args: Expr[] }>) => Value;
export function evaluateExpression(expr: Expr, resolve: Resolve, tolerance = 0): Value {
  if (expr === null || typeof expr !== "object") return expr === null || expr === "unknown" ? UNKNOWN : expr;
  if (Array.isArray(expr)) return expr.some(v => v === null || v === "unknown") ? UNKNOWN : expr;
  if (!("op" in expr)) return resolve(expr);
  const args = expr.args.map(a => evaluateExpression(a, resolve, tolerance));
  // A28: definite Boolean outcomes dominate irrelevant unknown operands.
  if (expr.op === "and" && args.includes(false)) return false;
  if (expr.op === "or" && args.includes(true)) return true;
  if (args.some(a => a === UNKNOWN || a === null || a === undefined || a === "unknown")) return UNKNOWN;
  const [a, b] = args;
  const nums = args.every(v => typeof v === "number" && Number.isFinite(v));
  const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
  switch (expr.op) {
    case "and": return args.every(v => typeof v === "boolean") ? args.every(Boolean) : UNKNOWN;
    case "or": return args.every(v => typeof v === "boolean") ? args.some(Boolean) : UNKNOWN;
    case "not": return typeof a === "boolean" ? !a : UNKNOWN;
    case "exists": return a !== "" && (!Array.isArray(a) || a.length > 0);
    case "==": return equal(a, b, tolerance);
    case "!=": return !equal(a, b, tolerance);
    case "in": return Array.isArray(b) ? b.some(x => equal(a, x)) : UNKNOWN;
    case "<": case "<=": case ">": case ">=": {
      if (!(nums || date(a) && date(b))) return UNKNOWN;
      const left = a as number, right = b as number;
      return expr.op === "<" ? left < right : expr.op === "<=" ? left <= right : expr.op === ">" ? left > right : left >= right;
    }
    case "+": return nums ? (a as number) + (b as number) : UNKNOWN;
    case "-": return nums ? (a as number) - (b as number) : UNKNOWN;
    case "*": return nums ? (a as number) * (b as number) : UNKNOWN;
    case "/": return nums && b !== 0 ? (a as number) / (b as number) : UNKNOWN;
    case "abs": return nums ? Math.abs(a as number) : UNKNOWN;
    case "sum": case "min": case "max": {
      const list = Array.isArray(a) ? a : [a];
      if (!list.every(v => typeof v === "number" && Number.isFinite(v)) || (!list.length && expr.op !== "sum")) return UNKNOWN;
      return expr.op === "sum" ? list.reduce((s: number, v: number) => s + v, 0) : expr.op === "min" ? Math.min(...list) : Math.max(...list);
    }
    case "days_between": return date(a) && date(b) ? daysBetween(a, b) : UNKNOWN;
    case "add_days": return date(a) && typeof b === "number" && Number.isInteger(b) ? addDays(a, b) : UNKNOWN;
    case "add_years": return date(a) && typeof b === "number" && Number.isInteger(b) ? addYears(a, b) : UNKNOWN;
  }
}
