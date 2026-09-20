import { z } from "zod";
import {
  DOCUMENT_TYPES,
  FACT_CATALOG,
  type DocumentType,
  type FactDefinition,
} from "@/lib/domain/registry";
import { loadPack, OVERLAY_IDS, PACK_VERSIONS } from "@/lib/rules/loader";
import type { Check, Expr, Rule } from "@/lib/rules/schema";
import { hashObject } from "@/lib/hash";

/** Attributes referenced by a rule, including the engine-implicit buyer/seller names of a buyer_seller agreement. */
function walk(expr: Expr | undefined, into: Set<string>) {
  if (!expr || typeof expr !== "object") return;
  if (Array.isArray(expr)) return;
  if ("fact" in expr) {
    into.add(expr.fact);
    if (expr.relative_to) into.add(expr.relative_to);
  }
  if ("op" in expr) for (const arg of expr.args) walk(arg, into);
}
function checkAttributes(check: Check, into: Set<string>) {
  walk(check.expr, into);
  walk(check.when, into);
  if (check.fact) into.add(check.fact);
  for (const f of check.facts ?? []) into.add(f);
  if (check.mode === "buyer_seller") {
    into.add("deal.buyer");
    into.add("deal.seller");
  }
}
export type Consumption = { attributes: Set<string> };
let cached: Consumption | null = null;
/** A38: what an active rule in any shipped pack or overlay consumes, computed from the packs. */
export function consumption(): Consumption {
  if (cached) return cached;
  const attributes = new Set<string>();
  const packs = PACK_VERSIONS.flatMap((v) => [
    loadPack(v),
    ...OVERLAY_IDS.map((o) => loadPack(v, o)),
  ]);
  const rules: Rule[] = packs.flatMap((p) => [...p.items, ...p.consistency]);
  for (const rule of rules) {
    walk(rule.applies_when, attributes);
    for (const check of rule.checks) checkAttributes(check, attributes);
  }
  cached = { attributes };
  return cached;
}
/** A38: the extraction schema of a type is the catalog entries it produces and a rule consumes. Any producer is extracted, including classification-era types such as the ownership chart. */
export function extractionFields(type: DocumentType): FactDefinition[] {
  const { attributes } = consumption();
  return FACT_CATALOG.filter(
    (f) => f.producers.includes(type) && attributes.has(f.attribute),
  );
}
/** A rule-consumed attribute that only this type can produce is expected of every such document; a null is an extraction gap. */
export function expectedAttributes(type: DocumentType): string[] {
  return extractionFields(type)
    .filter((f) => f.producers.length === 1)
    .map((f) => f.attribute);
}
export const schemaHash = () =>
  hashObject(
    Object.fromEntries(
      DOCUMENT_TYPES.map((t) => [
        t,
        extractionFields(t).map((f) => f.attribute),
      ]),
    ),
  );
/** Model-facing value shapes (A37 rule 6 and 7): money carries a currency, identifiers are last four only. */
export const MODEL_VALUE_DESCRIPTIONS: Record<FactDefinition["value_type"], string> = {
  text: "string",
  money: '{"amount": number, "currency": "USD"}',
  number: "number",
  date: '"YYYY-MM-DD" only when the document fixes the exact date',
  boolean: "true or false",
  identifier: '{"last_four": "1234"} — the last four digits only',
  owners: '[{"name": string, "percent": number 0-100, "title": string or null}]',
  amounts: '[{"label": string, "amount": number}]',
  debts: '[{"creditor": string, "balance": number, "payment": number}]',
  strings: "[string]",
};
/** Structured output wrapper: values are JSON-encoded strings so one strict schema serves every type. */
export const ExtractionOutputSchema = z.object({
  fields: z.array(
    z.object({
      attribute: z.string(),
      value: z.string().nullable(),
      source_block_ids: z.array(z.string()),
      evidence_quote: z.string().nullable(),
      region: z.string().nullable(),
      ambiguity: z.string().nullable(),
    }),
  ),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
export const VerificationOutputSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      status: z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"]),
      corrected_value: z.string().nullable(),
      contradiction_detected: z.boolean(),
      evidence_specificity: z.number(),
      reason: z.string(),
    }),
  ),
});
export type VerificationOutput = z.infer<typeof VerificationOutputSchema>;
