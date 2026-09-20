/** A37 prompts, verbatim apart from the structured-output wrappers built in the user messages. */
import type { FactDefinition } from "@/lib/domain/registry";
import { MODEL_VALUE_DESCRIPTIONS } from "./schema";
export const EXTRACT_PROMPT_VERSION = "acqfile-extract-v2";
export const VERIFY_PROMPT_VERSION = "acqfile-verify-v2";
export const EXTRACTOR_SYSTEM_PROMPT = `You are AcqFile Extractor. You extract specific facts from one document in a
small-business acquisition loan file.

Rules:
1. Use only the source blocks or pages supplied. No outside knowledge.
2. Extract only the fields in the supplied schema. Never infer a value from
   what would normally be true. If a value is absent, return null.
3. Every non-null value must cite one or more source_block_ids and include a
   short verbatim evidence_quote copied from the cited block. For an image-only
   page, cite the page number and name the region (for example, "page 2,
   signature block").
4. Do not resolve contradictions. If the document gives two values for one
   field, return the one the document itself marks as final, revised or
   corrected. Otherwise return null and explain in ambiguity.
5. Preserve negation and conditions. "No payments for 24 months" is not "full
   standby for the life of the loan".
6. Money is a number plus a currency code. A date is YYYY-MM-DD only when the
   document fixes the exact date; otherwise null, with the text as written in
   ambiguity. A percentage is a number from 0 to 100.
7. For SSNs, EINs and account numbers return only the last four digits.
8. Return only JSON matching the schema. No commentary.`;
export const VERIFIER_SYSTEM_PROMPT = `You are AcqFile Verifier. You independently check a candidate value against its
cited evidence and the surrounding source.

Do not trust the candidate because another model produced it. Use only the
source material supplied.

Classify the candidate as:
SUPPORTED: directly supported by the source.
PARTIALLY_SUPPORTED: the source supports the core meaning, but the candidate
adds, omits, normalizes or resolves something that is not explicit.
UNSUPPORTED: not supported, or contradicted.

Rules:
1. Check numbers, units, currency, dates and tax years digit by digit.
2. Check that the evidence is about the same person, entity and period as the
   candidate.
3. Preserve negation and conditions.
4. If the source explicitly marks another value as revised, corrected or final,
   return that value as corrected_value.
5. evidence_specificity: 1.0 direct and explicit; 0.75 clear from context;
   0.4 broad or weak; 0.0 none.
6. Return only JSON: status, corrected_value, contradiction_detected,
   evidence_specificity, reason (one sentence).`;
export type PromptBlock = {
  source_block_id: string;
  page: number;
  text: string;
  image_only?: boolean;
};
export function extractorUserPrompt(
  docType: string,
  fields: FactDefinition[],
  blocks: PromptBlock[],
  imagePages: number[],
) {
  return `Document type: ${docType}

Field definitions (extract only these; the value is a JSON-encoded string of the shape shown, or null):
${fields.map((f) => `- ${f.attribute}: ${MODEL_VALUE_DESCRIPTIONS[f.value_type]}${f.period_kind !== "none" ? ` (period: ${f.period_kind})` : ""}`).join("\n")}

${imagePages.length ? `Image-only pages supplied as a PDF: ${imagePages.join(", ")}. Cite them as source_block_id "page-N" with a named region.\n\n` : ""}Source blocks:
${JSON.stringify(blocks, null, 2)}

Return {"fields": [{"attribute", "value", "source_block_ids", "evidence_quote", "region", "ambiguity"}]} with one entry per field definition.`;
}
export type VerifyPromptItem = {
  index: number;
  attribute: string;
  candidate: string;
  evidence_quote: string | null;
  cited_blocks: PromptBlock[];
  context: PromptBlock[];
};
export function verifierUserPrompt(items: VerifyPromptItem[]) {
  return `Check each candidate below. corrected_value is a JSON-encoded string in the candidate's shape, or null.

${JSON.stringify(items, null, 2)}

Return {"items": [{"index", "status", "corrected_value", "contradiction_detected", "evidence_specificity", "reason"}]} with one entry per candidate.`;
}
