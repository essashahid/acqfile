/**
 * Prompts as specified (spec sections 16, 18, 25, 26, 32). System prompts are verbatim; the user
 * templates are filled in here. Structured-output enforcement wraps them without changing the text.
 */
import { DOCUMENT_TYPES } from "@/lib/schema/report";

export const EXTRACTOR_SYSTEM_PROMPT = `You are EvidenceOps Extractor, a structured information extraction system.

Your job is to extract only information that is explicitly supported by the source blocks supplied to you.

Rules:

1. Never use outside knowledge.
2. Never infer a missing value from what would normally be true.
3. If a value is absent, return null or an empty list according to the schema.
4. Every non-null scalar value and every extracted list item must cite one or more source_block_ids.
5. Every cited item must include a short verbatim evidence_quote copied from the supplied source block.
6. Do not silently resolve contradictions. If two source passages conflict, return the most contextually authoritative candidate only when the document explicitly identifies it as corrected, revised, final, or superseding. Otherwise mark the field ambiguous.
7. Preserve negation. "No evidence of delay" must never become "delay occurred."
8. Monetary values must be represented numerically with a separate ISO-style currency code when stated.
9. Dates must be normalized to YYYY-MM-DD only when the document gives enough information to determine the exact date. Otherwise return null.
10. Return only JSON matching the supplied schema.
11. Do not include commentary outside the JSON.`;

export type PromptBlock = { source_block_id: string; locator: string; text: string };

export function extractorUserPrompt(logicalKey: string, versionNumber: number, blocks: PromptBlock[]): string {
  return `Extract the operational-report record from the source blocks below.

DOCUMENT LOGICAL KEY:
${logicalKey}

DOCUMENT VERSION:
${versionNumber}

ALLOWED DOCUMENT TYPES:
${DOCUMENT_TYPES.map((t) => `- ${t}`).join("\n")}

SOURCE BLOCKS:
${JSON.stringify(blocks, null, 2)}

Return this structure:

{
  "report_title": { "value": "string or null", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" },
  "report_number": { "value": "string or null", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" },
  "issuing_organization": { "value": "string or null", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" },
  "publication_date": { "value": "YYYY-MM-DD or null", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" },
  "document_type": { "value": "${DOCUMENT_TYPES.join(" | ")}", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" },
  "subject_entities": [ { "name": "string", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" } ],
  "key_findings": [ { "finding": "string", "severity": "info | low | medium | high", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" } ],
  "recommendations": [ { "recommendation": "string", "target_entity": "string or null", "status_if_stated": "string or null", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" } ],
  "monetary_amounts": [ { "amount": 0, "currency": "string", "context": "string", "source_block_ids": ["string"], "evidence_quotes": ["string"], "ambiguity": "string or null" } ]
}`;
}

export const VERIFIER_SYSTEM_PROMPT = `You are EvidenceOps Verifier.

You independently verify a candidate extracted value against its cited source evidence and surrounding context.

Do not trust the candidate simply because another model produced it.

Use only the source material supplied in this request.

Classify the candidate as:

SUPPORTED:
The candidate is directly supported by the source.

PARTIALLY_SUPPORTED:
The source supports the core meaning, but the candidate adds, omits, normalizes, or resolves something that is not completely explicit.

UNSUPPORTED:
The candidate is not supported or is contradicted.

Rules:

1. Preserve negation.
2. Check numbers, units, currency and dates carefully.
3. Check whether the evidence is about the same entity as the candidate.
4. If the source explicitly marks another value as revised, corrected, final or superseding, use the revised value.
5. Do not use external knowledge.
6. If a corrected value can be stated exactly from the supplied evidence, return it.
7. evidence_specificity must be between 0 and 1:

   * 1.0 = direct, explicit support
   * 0.75 = clear contextual support
   * 0.4 = broad or weak support
   * 0.0 = no support
8. Return only JSON matching the schema.`;

export type VerifierPromptItem = {
  fieldPath: string;
  fieldDefinition: string;
  candidate: unknown;
  evidence: { source_block_id: string; quote: string; found_in_block: boolean }[];
  context: { source_block_id: string; locator: string; text: string }[];
};

export function verifierUserPrompt(item: VerifierPromptItem): string {
  return `FIELD:
${item.fieldPath}

FIELD DEFINITION:
${item.fieldDefinition}

CANDIDATE VALUE:
${JSON.stringify(item.candidate)}

CITED EVIDENCE:
${JSON.stringify(item.evidence, null, 2)}

SURROUNDING SOURCE CONTEXT:
${JSON.stringify(item.context, null, 2)}

Return:

{
  "status": "supported | partially_supported | unsupported",
  "corrected_value": null,
  "contradiction_detected": false,
  "evidence_specificity": 0.0,
  "reason": "one concise sentence"
}`;
}

/** Batched variant: several fields from the same document in one request, each with its index. */
export function verifierBatchUserPrompt(items: VerifierPromptItem[]): string {
  return items.map((it, i) => `### ITEM ${i}\n${verifierUserPrompt(it)}`).join("\n\n") + `\n\nReturn one result per item, in order, as {"items": [{"index": 0, ...}, ...]}.`;
}

/** Human-readable locator per spec section 13: "page 3" or "paragraph 17". */
export function humanLocator(block: { pageNumber: number | null; paragraphNumber: number | null }): string {
  return block.pageNumber !== null ? `page ${block.pageNumber}` : `paragraph ${block.paragraphNumber ?? "?"}`;
}
