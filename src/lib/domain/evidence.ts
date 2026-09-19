import { createHmac } from "node:crypto";
import { z } from "zod";
import { DocumentTypeSchema, FactAttributeSchema, FACTS } from "./registry";
import { DateOnly, IdentifierSchema } from "./profile";
export const LocatorSchema = z.strictObject({ file: z.string().min(1), page: z.number().int().positive(), source_block: z.string().min(1), quote: z.string().min(1), region: z.array(z.number()).length(4).optional() });
export const SegmentSchema = z.strictObject({ id: z.string().min(1), document_version_id: z.string().min(1), file: z.string().min(1), metadata_locator: LocatorSchema, page_start: z.number().int().positive(), page_end: z.number().int().positive(), doc_type: DocumentTypeSchema, party_id: z.string().nullable(), period: z.string().nullable(), form_revision: z.string().nullable(), signed: z.boolean().nullable(), dated: z.boolean().nullable(), signature_date: DateOnly.nullable(), document_date: DateOnly.nullable(), expected_page_count: z.number().int().positive().nullable(), account_last_four: z.string().regex(/^\d{4}$/).nullable(), classification_method: z.enum(["signature", "llm", "manual"]), classification_confidence: z.number().min(0).max(1), status: z.enum(["proposed", "confirmed", "rejected"]), is_current: z.boolean() }).refine(s => s.page_end >= s.page_start, "Invalid page range");
const OwnerValue = z.strictObject({ name: z.string().min(1), percent: z.number().min(0).max(100), title: z.string().optional(), identifier: IdentifierSchema.optional() });
export const VALUE_SCHEMAS = { text: z.string().min(1), money: z.number().finite(), number: z.number().finite(), date: DateOnly, boolean: z.boolean(), identifier: IdentifierSchema, owners: z.array(OwnerValue).min(1), amounts: z.array(z.strictObject({ label: z.string().min(1), amount: z.number().finite() })).min(1), debts: z.array(z.strictObject({ creditor: z.string().min(1), balance: z.number().finite(), payment: z.number().finite() })), strings: z.array(z.string()) };
export const FactSchema = z.strictObject({ id: z.string().min(1), segment_id: z.string().min(1), subject_party_id: z.string().nullable(), attribute: FactAttributeSchema, value: z.unknown(), normalized_value: z.unknown(), unit: z.string(), period: z.string().nullable(), method: z.enum(["acroform", "text", "vision", "manual", "declared"]), locator: LocatorSchema, confidence: z.number().min(0).max(1), confidence_components: z.record(z.string(), z.number().min(0).max(1)), validators_passed: z.boolean(), actor: z.string().nullable(), audit_event_id: z.string().nullable(), record_version: z.number().int().positive(), is_current: z.boolean() }).superRefine((f, ctx) => {
  const d = FACTS[f.attribute];
  if (!d) return;
  for (const key of ["value", "normalized_value"] as const) if (!VALUE_SCHEMAS[d.value_type].safeParse(f[key]).success) ctx.addIssue({ code: "custom", message: `Invalid ${key} for ${f.attribute}` });
  if (f.unit !== d.unit) ctx.addIssue({ code: "custom", message: "Fact unit disagrees with catalog" });
  if (f.method === "manual" && (!f.actor || !f.audit_event_id || !f.validators_passed)) ctx.addIssue({ code: "custom", message: "Manual fact requires actor, audit event and passing validators" });
});
export type Segment = z.infer<typeof SegmentSchema>;
export type Fact = z.infer<typeof FactSchema>;
// Caller supplies a secret key. This helper has no environment or persistence access.
export function maskIdentifier(clear: string, key: string) {
  const digits = clear.replace(/[\s-]/g, "");
  if (!/^\d{8,17}$/.test(digits) || key.length < 32) throw new Error("Invalid identifier or HMAC key");
  return { hmac: createHmac("sha256", key).update(digits).digest("hex"), last_four: digits.slice(-4) };
}
export function scrubIdentifiers(text: string) {
  return text.replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d{2}[- ]\d{7}\b|\b\d{8,17}\b/g, value => `[masked ••••${value.replace(/\D/g, "").slice(-4)}]`);
}
