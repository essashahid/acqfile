/**
 * Deterministic fixture-backed extractor and verifier (LLM_PROVIDER=mock). It answers from committed
 * truth keyed by file hash and misbehaves exactly where the plans plant an A43 fault. Truth is read
 * only here; deterministic code never imports it.
 */
import fs from "node:fs";
import { preparedDemoFiles } from "@/lib/demo/prepared";
import path from "node:path";
import { normalizeText, canonical } from "@/lib/text";
import type { ExtractionProvider, ExtractRequest } from "./provider";
import { valueText } from "./values";
type TruthFact = {
  id: string;
  segment_id: string;
  attribute: string;
  value: unknown;
  locator: {
    page: number;
    source_block: string;
    quote: string;
    region?: string;
    verbatim?: boolean;
  };
};
type TruthFault = {
  id: string;
  document: string;
  attribute: string;
  kind: string;
  expected: string;
  description?: string;
  extractor: { value: unknown; quote: string | null; second_read?: unknown };
  verifier: {
    status: string;
    corrected_value: unknown;
    contradiction: boolean;
    specificity: number;
  } | null;
};
type TruthFile = {
  hash: string | null;
  segments: { id: string; page_start: number; page_end: number }[];
  facts: TruthFact[];
  faults: TruthFault[];
};
const MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/**
 * Values as a reader compares them: "$1,300,000" states 1300000 and "August 31, 2026" or
 * "08/31/2026" states 2026-08-31, as they would to the live verifier.
 */
export function comparable(input: string) {
  const iso = (y: string, m: number, d: string) =>
    `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
  return canonical(
    normalizeText(input)
      .replace(
        /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? (\d{1,2}), (\d{4})\b/gi,
        (_, m: string, d: string, y: string) =>
          iso(y, MONTH.indexOf(m.slice(0, 3).toLowerCase()) + 1, d),
      )
      .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, m: string, d: string, y: string) =>
        iso(y, Number(m), d),
      )
      .replace(/(\d),(?=\d{3}(?!\d))/g, "$1"),
  );
}
let cache: TruthFile[] | null = null;
export function loadTruthFiles(root = path.join(process.cwd(), "fixtures/deals")) {
  if (cache) return cache;
  cache = ["deal-a", "deal-b", "deal-c"].flatMap((deal) => {
    const file = path.join(root, deal, "truth/documents.json");
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as TruthFile[]) : [];
  });
  return cache;
}
export function resetMockTruth() {
  cache = null;
}
const modelShape = (value: unknown, valueType: string) => {
  if (value === null || value === undefined) return null;
  if (valueType === "money") return JSON.stringify({ amount: value, currency: "USD" });
  if (valueType === "identifier")
    return JSON.stringify({ last_four: (value as { last_four: string }).last_four });
  return JSON.stringify(value);
};
function locate(request: ExtractRequest) {
  const record = [...loadTruthFiles(), ...(preparedDemoFiles() as TruthFile[])].find(
    (d) => d.hash === request.hash,
  );
  const segment = record?.segments.find((s) => s.page_start === request.pageStart);
  return { record, segment };
}
const usage = (model: string, input: unknown, output: unknown) => ({
  model,
  inputTokens: Math.ceil(JSON.stringify(input).length / 4),
  outputTokens: Math.ceil(JSON.stringify(output).length / 4),
  latencyMs: 1,
  cost: 0,
});
export function createMockExtractionProvider(): ExtractionProvider {
  return {
    name: "mock",
    models: { extract: "mock", verify: "mock" },
    async extract(request) {
      const { record, segment } = locate(request);
      const fields = request.fields.map((def) => {
        const fact =
          record && segment
            ? record.facts.find((f) => f.segment_id === segment.id && f.attribute === def.attribute)
            : undefined;
        const fault =
          record && segment
            ? record.faults.find((f) => f.document === segment.id && f.attribute === def.attribute)
            : undefined;
        if (!fact)
          return {
            attribute: def.attribute,
            value: null,
            source_block_ids: [],
            evidence_quote: null,
            region: null,
            ambiguity: null,
          };
        if (fault?.kind === "missing_value")
          return {
            attribute: def.attribute,
            value: null,
            source_block_ids: [],
            evidence_quote: null,
            region: null,
            ambiguity: "Value not found in the supplied source.",
          };
        const vision = request.imagePages.includes(fact.locator.page);
        let value = fact.value;
        let quote: string | null = fact.locator.quote;
        if (fault) {
          if (fault.kind === "vision_disagreement")
            value = request.pass === 2 ? fault.extractor.second_read : fault.extractor.value;
          else value = fault.extractor.value;
          quote = fault.extractor.quote;
        }
        if (vision)
          return {
            attribute: def.attribute,
            value: modelShape(value, def.value_type),
            source_block_ids: [`page-${fact.locator.page}`],
            evidence_quote: valueText(value),
            region: fact.locator.region ?? def.attribute,
            ambiguity: null,
          };
        const onPage = request.blocks.filter((b) => b.page === fact.locator.page);
        // A spreadsheet cell that is the value itself beats one that merely contains it.
        const cited =
          onPage.find((b) => quote && normalizeText(b.text) === normalizeText(quote)) ??
          onPage.find((b) => quote && normalizeText(b.text).includes(normalizeText(quote))) ??
          onPage.find((b) => b.source_block_id === `page-${fact.locator.page}`) ??
          onPage[0];
        return {
          attribute: def.attribute,
          value: modelShape(value, def.value_type),
          source_block_ids: cited ? [cited.source_block_id] : [],
          evidence_quote: quote,
          region: null,
          ambiguity: null,
        };
      });
      const output = { fields };
      return { output, usage: usage("mock", request.blocks, output) };
    },
    async verify(request) {
      const record = [...loadTruthFiles(), ...(preparedDemoFiles() as TruthFile[])].find(
        (d) => d.hash === request.hash,
      );
      const segment = record?.segments.find((s) => s.page_start === request.pageStart);
      const items = request.items.map((item) => {
        const fault =
          record && segment
            ? record.faults.find(
                (f) => f.document === segment.id && f.attribute === item.attribute && f.verifier,
              )
            : undefined;
        if (fault?.verifier) {
          const v = fault.verifier;
          return {
            index: item.index,
            status: v.status.toUpperCase() as "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED",
            corrected_value: v.corrected_value === null ? null : JSON.stringify(v.corrected_value),
            contradiction_detected: v.contradiction,
            evidence_specificity: v.specificity,
            reason: fault.description ?? `Planted fault ${fault.id}.`,
          };
        }
        const candidate = JSON.parse(item.candidate) as unknown;
        // Yes/no facts are stated as clauses ("No repayment is expected"), not the words Yes or No,
        // so a real verifier judges the cited clause; the mock checks the clause is on the page.
        const text = typeof candidate === "boolean" ? "" : comparable(valueText(candidate));
        const quoteText = comparable(item.evidence_quote ?? "");
        const citedText = comparable(item.cited_blocks.map((b) => b.text).join(" "));
        const contextText = comparable(item.context.map((b) => b.text).join(" "));
        const imageOnly = item.cited_blocks.some((b) => b.image_only);
        if (imageOnly || (quoteText && citedText.includes(quoteText) && quoteText.includes(text)))
          return {
            index: item.index,
            status: "SUPPORTED" as const,
            corrected_value: item.candidate,
            contradiction_detected: false,
            evidence_specificity: 1,
            reason: imageOnly
              ? "The value is legible in the cited page region."
              : "The cited quote states the value.",
          };
        if (text && (citedText.includes(text) || contextText.includes(text)))
          return {
            index: item.index,
            status: "PARTIALLY_SUPPORTED" as const,
            corrected_value: item.candidate,
            contradiction_detected: false,
            evidence_specificity: 0.75,
            reason: "The value appears in the surrounding source but not in the cited quote.",
          };
        return {
          index: item.index,
          status: "UNSUPPORTED" as const,
          corrected_value: null,
          contradiction_detected: false,
          evidence_specificity: 0,
          reason: "The cited source does not state the value.",
        };
      });
      const output = { items };
      return { output, usage: usage("mock", request.items, output) };
    },
  };
}
