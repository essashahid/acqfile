import { parseNumber, parseBoolean, parseDate } from "./parse-value";
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
      value =
        ["money", "number"].includes(def.value_type) && !/^[{"]/.test(raw.trim())
          ? raw
          : JSON.parse(raw);
    } catch {
      value = raw;
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
      if (money.currency !== undefined && money.currency !== "USD")
        return { value: null, error: "currency_invalid" };
      value = money.amount;
    }
  }
  if (def.value_type === "money" || def.value_type === "number") value = parseNumber(value);
  if (def.value_type === "boolean") value = parseBoolean(value);
  if (def.value_type === "date") value = parseDate(value);
  if (def.value_type === "identifier") {
    if (value && typeof value === "object" && "last_four" in value) return { value, error: null };
    return { value: null, error: "identifier_shape" };
  }
  if (def.value_type === "owners" && Array.isArray(value))
    value = (value as unknown[]).map((o) =>
      o && typeof o === "object" && "title" in o && (o as { title: unknown }).title === null
        ? { ...(o as Record<string, unknown>), title: undefined }
        : o,
    );
  if (Array.isArray(value) && ["owners", "amounts", "debts"].includes(def.value_type))
    value = value.map((row) => {
      if (!row || typeof row !== "object") return row;
      const keys =
        def.value_type === "owners"
          ? ["percent"]
          : def.value_type === "amounts"
            ? ["amount"]
            : ["balance", "payment"];
      return { ...row, ...Object.fromEntries(keys.map((key) => [key, parseNumber(row[key])])) };
    });
  return { value, error: value === null ? "value_missing_or_unsupported" : null };
}
export function valueValid(def: FactDefinition, value: unknown) {
  if (def.value_type === "identifier")
    return typeof value === "object" && value !== null && "last_four" in value;
  return VALUE_SCHEMAS[def.value_type].safeParse(value).success;
}
/** Human text of a value, used for non-verbatim quotes and support checks. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("last_four" in value) return String((value as { last_four: string }).last_four);
    return Object.values(value as Record<string, unknown>)
      .filter((v) => v !== undefined)
      .map(valueText)
      .join(" / ");
  }
  if (Array.isArray(value)) return value.map(valueText).join("; ");
  return String(value);
}
/** Normalized value for storage: names are normalized as the engine normalizes them; every other type keeps its catalog shape (the engine normalizes again when it compares). */
export const normalizeFact = (attribute: string, value: unknown) => {
  const def = FACTS[attribute];
  if (def?.value_type === "text" && typeof value === "string")
    return (normalizeValue(value) as string) || value;
  return value;
};
/** A39 cross-pass agreement: 1 same after normalization, 0.75 formatting-only difference, 0 materially different. */
export function agreement(a: unknown, b: unknown): 0 | 0.75 | 1 {
  if (b === null || b === undefined) return 0;
  if (JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b))) return 1;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005 ? 1 : 0;
  if (canonical(valueText(a)) === canonical(valueText(b))) return 0.75;
  return 0;
}
