import { VALUE_SCHEMAS } from "@/lib/domain/evidence";
import { FACTS, type FactDefinition } from "@/lib/domain/registry";
import { normalizeValue } from "@/lib/rules/expressions";
import { canonical } from "@/lib/text";
export type Decoded = { value: unknown; error: string | null };
/** Decode a model-facing value (A37 rule 6/7 shapes) into the catalog value shape. Identifiers stay last-four only here. */
export function decodeModelValue(def: FactDefinition, raw: unknown): Decoded {
  if (raw === null || raw === undefined) return { value: null, error: null };
  let value: unknown = raw;
  if (typeof raw === "string" && def.value_type !== "text" && def.value_type !== "date") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { value: null, error: "value_unparseable" };
    }
  } else if (typeof raw === "string" && (def.value_type === "text" || def.value_type === "date")) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") value = parsed;
    } catch {
      value = raw;
    }
  }
  if (def.value_type === "money") {
    if (value && typeof value === "object" && "amount" in value) {
      const money = value as { amount: unknown; currency?: unknown };
      if (money.currency !== undefined && money.currency !== "USD") return { value: null, error: "currency_invalid" };
      value = money.amount;
    }
  }
  if (def.value_type === "identifier") {
    if (value && typeof value === "object" && "last_four" in value) return { value, error: null };
    return { value: null, error: "identifier_shape" };
  }
  if (def.value_type === "owners" && Array.isArray(value))
    value = (value as unknown[]).map((o) => (o && typeof o === "object" && "title" in o && (o as { title: unknown }).title === null ? { ...(o as Record<string, unknown>), title: undefined } : o));
  return { value, error: null };
}
export function valueValid(def: FactDefinition, value: unknown) {
  if (def.value_type === "identifier") return typeof value === "object" && value !== null && "last_four" in value;
  return VALUE_SCHEMAS[def.value_type].safeParse(value).success;
}
/** Human text of a value, used for non-verbatim quotes and support checks. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("last_four" in value) return String((value as { last_four: string }).last_four);
    return Object.values(value as Record<string, unknown>).filter((v) => v !== undefined).map(valueText).join(" / ");
  }
  if (Array.isArray(value)) return value.map(valueText).join("; ");
  return String(value);
}
/** Normalized value for storage and conflict detection. Identifiers keep their masked object shape, as the facts table requires. */
export const normalizeFact = (attribute: string, value: unknown) => (FACTS[attribute]?.value_type === "identifier" ? value : normalizeValue(value));
/** A39 cross-pass agreement: 1 same after normalization, 0.75 formatting-only difference, 0 materially different. */
export function agreement(a: unknown, b: unknown): 0 | 0.75 | 1 {
  if (b === null || b === undefined) return 0;
  if (JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b))) return 1;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005 ? 1 : 0;
  if (canonical(valueText(a)) === canonical(valueText(b))) return 0.75;
  return 0;
}
