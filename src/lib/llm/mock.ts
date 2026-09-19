/**
 * Deterministic, fixture-backed provider for tests, CI and offline development (LLM_PROVIDER=mock).
 * It never invents data: extraction comes from the committed truth records (including the planted
 * uncertain readings), and verification is rule based.
 * It is selected only explicitly and is never used as a fallback for the real provider.
 */
import fs from "node:fs";
import path from "node:path";
import { canonical, normalizeText, tokenize } from "@/lib/text";
import { LIST_FIELDS, LIST_ITEM_KEYS, SCALAR_FIELDS, fieldKind, parseFieldPath, type ExtractionOutput, type ReportRecord } from "@/lib/schema/report";
import type { ExtractInput, ExtractResult, LlmModels, LlmProvider, LlmUsage, VerifyItem, VerifyOutcome, VerifyResult } from "./types";

export type MockUncertainField = {
  field_path: string;
  kind: string;
  reason: string;
  extractor_value: unknown;
  extractor_locators: string[];
  extractor_quotes: string[];
  extractor_ambiguity: string | null;
  verifier: { status: "supported" | "partially_supported" | "unsupported"; corrected_value: unknown; contradiction_detected: boolean; evidence_specificity: number };
  expect_routed: boolean;
};

export type MockTruth = {
  logical_key: string;
  version: number;
  record: ReportRecord;
  evidence: Record<string, { locators: string[]; quotes: string[] }>;
  uncertain_fields: MockUncertainField[];
};

let cachedTruths: MockTruth[] | null = null;

export function loadTruths(dir = path.resolve(process.cwd(), "fixtures/legacy/truth")): MockTruth[] {
  if (cachedTruths) return cachedTruths;
  cachedTruths = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as MockTruth)
    : [];
  return cachedTruths;
}

export function resetMockCache() {
  cachedTruths = null;
}

function usage(model: string, input: string, output: string): LlmUsage {
  return { model, inputTokens: Math.ceil(input.length / 4), outputTokens: Math.ceil(output.length / 4), latencyMs: 1 };
}

/** Parse money expressions like "$1.25 million", "USD 480,000", "1.15m" into major units. */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?:\$|usd|eur|gbp|cad|aud|€|£)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(million|billion|thousand|m|bn|k)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const num = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(num)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult = unit === "million" || unit === "m" ? 1e6 : unit === "billion" || unit === "bn" ? 1e9 : unit === "thousand" || unit === "k" ? 1e3 : 1;
    out.push(num * mult);
  }
  return out;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];

function monthIndex(name: string): number {
  const n = name.toLowerCase().replace(/\.$/, "");
  const full = MONTHS.indexOf(n);
  if (full >= 0) return full;
  const abbr = MONTH_ABBR.indexOf(n);
  if (abbr < 0) return -1;
  return abbr >= 9 ? abbr - 1 : abbr; // "sept" shares September's slot
}

/** Parse dates like "12 March 2026", "March 12, 2026", "2026-03-12", "4 Sept. 26" into ISO strings. */
export function parseDates(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(text))) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  const dmy = /\b(\d{1,2})\s+([A-Za-z]+\.?)\s+(\d{2,4})\b/g;
  while ((m = dmy.exec(text))) {
    const mi = monthIndex(m[2]!);
    if (mi < 0) continue;
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    out.push(`${year}-${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  const mdy = /\b([A-Za-z]+\.?)\s+(\d{1,2}),\s+(\d{4})\b/g;
  while ((m = mdy.exec(text))) {
    const mi = monthIndex(m[1]!);
    if (mi >= 0) out.push(`${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`);
  }
  return out;
}

function findLocators(blocks: ExtractInput["blocks"], quote: string): string[] {
  const q = normalizeText(quote);
  if (!q) return [];
  const hits = blocks.filter((b) => normalizeText(b.text).includes(q)).map((b) => b.source_block_id);
  if (hits.length) return hits;
  const lower = q.toLowerCase();
  return blocks.filter((b) => normalizeText(b.text).toLowerCase().includes(lower)).map((b) => b.source_block_id);
}

function matchTruth(input: ExtractInput, truths: MockTruth[]): MockTruth | null {
  const exact = truths.find((t) => t.logical_key === input.logicalKey && t.version === input.versionNumber);
  if (exact) return exact;
  const text = canonical(input.blocks.map((b) => b.text).join(" "));
  let best: MockTruth | null = null;
  for (const t of truths) {
    const rn = canonical(t.record.report_number ?? "");
    if (!rn || !text.includes(rn)) continue;
    if (!best || rn.length > canonical(best.record.report_number ?? "").length) best = t;
  }
  return best;
}

type Prov = { source_block_ids: string[]; evidence_quotes: string[]; ambiguity: string | null };

function buildFromTruth(t: MockTruth, input: ExtractInput): ExtractionOutput {
  const blocks = input.blocks;
  const fallback = blocks[0]?.source_block_id ?? "SRC-UNKNOWN";
  const planted = new Map(t.uncertain_fields.map((u) => [u.field_path, u]));
  const prov = (fp: string, fallbackQuote: string | null): { p: Prov; override?: unknown } => {
    const u = planted.get(fp);
    if (u) {
      const ids = u.extractor_locators.length ? u.extractor_locators : u.extractor_quotes.flatMap((q) => findLocators(blocks, q));
      return { p: { source_block_ids: ids.length ? ids : [fallback], evidence_quotes: u.extractor_quotes, ambiguity: u.extractor_ambiguity }, override: u.extractor_value };
    }
    const ev = t.evidence[fp];
    if (ev) {
      const ids = ev.locators.length ? ev.locators : ev.quotes.flatMap((q) => findLocators(blocks, q));
      return { p: { source_block_ids: ids.length ? ids : [fallback], evidence_quotes: ev.quotes, ambiguity: null } };
    }
    if (fallbackQuote === null) return { p: { source_block_ids: [], evidence_quotes: [], ambiguity: null } };
    const ids = findLocators(blocks, fallbackQuote);
    return { p: { source_block_ids: ids.length ? ids : [fallback], evidence_quotes: [fallbackQuote], ambiguity: null } };
  };
  const r = t.record;
  const scalar = <T>(fp: (typeof SCALAR_FIELDS)[number], value: T) => {
    const { p, override } = prov(fp, value === null ? null : String(value));
    const v = planted.has(fp) ? (override as T) : value;
    return { value: v, ...p };
  };
  const list = <K extends (typeof LIST_FIELDS)[number]>(field: K) => {
    const items = [...(r[field] as (Record<string, unknown> | null)[])];
    // planted indexes beyond the record mean "an extractor may invent this item"
    for (const u of t.uncertain_fields) {
      const { root, index } = parseFieldPath(u.field_path);
      if (root !== field || index === null) continue;
      while (items.length <= index) items.push(null);
    }
    return items.map((item, i) => {
      const fp = `${field}[${i}]`;
      const { p, override } = prov(fp, item ? String(Object.values(item)[0] ?? "") : null);
      const value = (planted.has(fp) ? override : item) as Record<string, unknown> | null;
      const out: Record<string, unknown> = { ...p };
      for (const k of LIST_ITEM_KEYS[field]) out[k] = value?.[k] ?? (k === "amount" ? 0 : k === "severity" ? "info" : k === "target_entity" || k === "status_if_stated" ? null : "");
      return out;
    });
  };
  return {
    report_title: scalar("report_title", r.report_title),
    report_number: scalar("report_number", r.report_number),
    issuing_organization: scalar("issuing_organization", r.issuing_organization),
    publication_date: scalar("publication_date", r.publication_date),
    document_type: scalar("document_type", r.document_type ?? "other"),
    subject_entities: list("subject_entities") as ExtractionOutput["subject_entities"],
    key_findings: list("key_findings") as ExtractionOutput["key_findings"],
    recommendations: list("recommendations") as ExtractionOutput["recommendations"],
    monetary_amounts: list("monetary_amounts") as ExtractionOutput["monetary_amounts"],
  };
}

/** Heuristic extraction for documents outside the fixture corpus. */
function buildHeuristic(input: ExtractInput): ExtractionOutput {
  const first = input.blocks[0];
  const id = first?.source_block_id ?? "SRC-UNKNOWN";
  const text = first?.text ?? "";
  const sentences = text.split(/(?<=[.!?])\s+|\s{2,}/).map((l) => l.trim()).filter(Boolean);
  const title = (sentences[0] ?? "").split(/\s+Report No/i)[0] ?? "";
  const numberSentence = sentences.find((l) => /report\s+no/i.test(l)) ?? "";
  const number = /report\s+no\.?\s*:?\s*([A-Z0-9-]+)/i.exec(numberSentence)?.[1] ?? null;
  const orgSentence = sentences.find((l) => /(issued|prepared)\s+by/i.test(l)) ?? "";
  const org = /(?:issued|prepared)\s+by\s+([^.]+)/i.exec(orgSentence)?.[1]?.trim() ?? null;
  const dateSentence = sentences.find((l) => /published/i.test(l) && parseDates(l).length > 0) ?? "";
  const date = parseDates(dateSentence)[0] ?? null;
  const lower = text.toLowerCase();
  const docType = lower.includes("audit") ? "audit_report" : lower.includes("investigation") ? "investigation" : lower.includes("evaluation") ? "evaluation" : lower.includes("guidance") ? "guidance" : lower.includes("review") ? "operational_review" : "other";
  const p = (q: string): Prov => ({ source_block_ids: q ? [id] : [], evidence_quotes: q ? [q.slice(0, 200)] : [], ambiguity: null });
  return {
    report_title: { value: title || null, ...p(title) },
    report_number: { value: number, ...p(number ? numberSentence : "") },
    issuing_organization: { value: org, ...p(org ? orgSentence : "") },
    publication_date: { value: date, ...p(date ? dateSentence : "") },
    document_type: { value: docType, ...p(title) },
    subject_entities: [],
    key_findings: [],
    recommendations: [],
    monetary_amounts: [],
  };
}

const CURRENCY_HINTS: Record<string, RegExp> = {
  USD: /\$|\busd\b|\bdollars?\b/i,
  EUR: /€|\beur\b|\beuros?\b/i,
  GBP: /£|\bgbp\b|\bpounds?\b/i,
  CAD: /\bcad\b|\bc\$/i,
  AUD: /\baud\b|\ba\$/i,
};

/** Rule-based support check for a candidate against a quote. */
function supportedByText(fieldPath: string, value: unknown, text: string): { supported: boolean; specificity: number; corrected: unknown } {
  const kind = fieldKind(fieldPath);
  const ct = canonical(text);
  if (kind === "date") {
    const dates = parseDates(text);
    return { supported: dates.includes(String(value)), specificity: dates.includes(String(value)) ? 1 : 0.4, corrected: dates[0] ?? null };
  }
  if (kind === "enum") {
    const literal = canonical(String(value).replace(/_/g, " "));
    return { supported: text.trim().length > 0, specificity: ct.includes(literal) ? 1 : 0.75, corrected: value };
  }
  if (kind === "item") {
    const item = (value ?? {}) as Record<string, unknown>;
    const root = parseFieldPath(fieldPath).root;
    if (root === "monetary_amounts") {
      const amounts = parseAmounts(text);
      const amountOk = amounts.some((a) => Math.abs(a - Number(item.amount)) < 0.5);
      const cur = String(item.currency ?? "");
      const curOk = CURRENCY_HINTS[cur]?.test(text) ?? ct.includes(canonical(cur));
      if (amountOk) return { supported: true, specificity: curOk ? 1 : 0.75, corrected: value };
      const first = amounts[0];
      return { supported: false, specificity: first !== undefined ? 0.4 : 0, corrected: first !== undefined ? { ...item, amount: first } : null };
    }
    const textKey = root === "subject_entities" ? "name" : root === "key_findings" ? "finding" : "recommendation";
    const main = canonical(item[textKey]);
    if (!main) return { supported: false, specificity: 0, corrected: null };
    const contained = ct.includes(main);
    const overlap = (() => {
      const qt = new Set(tokenize(text));
      const vt = tokenize(String(item[textKey]));
      return vt.filter((t) => qt.has(t)).length / Math.max(1, vt.length);
    })();
    if (contained || overlap >= 0.8) {
      const labelKey = root === "key_findings" ? "severity" : null;
      const labelLiteral = labelKey ? canonical(String(item[labelKey] ?? "")) : "";
      return { supported: true, specificity: !labelKey || ct.includes(labelLiteral) ? 1 : 0.75, corrected: value };
    }
    return { supported: overlap >= 0.5, specificity: overlap >= 0.5 ? 0.4 : 0, corrected: overlap >= 0.5 ? value : null };
  }
  const cv = canonical(String(value ?? ""));
  if (!cv) return { supported: false, specificity: 0, corrected: null };
  if (ct.includes(cv)) return { supported: true, specificity: 1, corrected: value };
  const qt = new Set(tokenize(text));
  const vt = tokenize(String(value));
  const overlap = vt.filter((t) => qt.has(t)).length / Math.max(1, vt.length);
  return { supported: overlap >= 0.8, specificity: overlap >= 0.8 ? 0.75 : overlap >= 0.5 ? 0.4 : 0, corrected: overlap >= 0.5 ? value : null };
}

export function createMockProvider(models?: Partial<LlmModels>): LlmProvider {
  const m: LlmModels = { extract: "mock", verify: "mock", ...models };

  return {
    name: "mock",
    models: m,

    async extract(input: ExtractInput): Promise<ExtractResult> {
      const t = matchTruth(input, loadTruths());
      const output = t ? buildFromTruth(t, input) : buildHeuristic(input);
      return { output, usage: usage(m.extract, input.blocks.map((b) => b.text).join("\n"), JSON.stringify(output)) };
    },

    async verify(items: VerifyItem[]): Promise<VerifyResult> {
      const planted = loadTruths().flatMap((t) => t.uncertain_fields);
      const outcomes: VerifyOutcome[] = items.map((it) => {
        const u = planted.find((x) => x.field_path === it.fieldPath && JSON.stringify(x.extractor_value) === JSON.stringify(it.candidateValue) && x.extractor_quotes.join("|") === it.evidence.map((e) => e.quote).join("|"));
        if (u) {
          return {
            fieldPath: it.fieldPath,
            status: u.verifier.status,
            correctedValue: u.verifier.corrected_value ?? (u.verifier.status === "supported" ? it.candidateValue : null),
            contradictionDetected: u.verifier.contradiction_detected,
            evidenceSpecificity: u.verifier.evidence_specificity,
            reason: u.reason,
          };
        }
        const found = it.evidence.filter((e) => e.found_in_block);
        if (found.length === 0) return { fieldPath: it.fieldPath, status: "unsupported", correctedValue: null, contradictionDetected: false, evidenceSpecificity: 0, reason: "cited quote not found in the cited source block" };
        const quoteText = found.map((e) => e.quote).join(" ");
        const byQuote = supportedByText(it.fieldPath, it.candidateValue, quoteText);
        if (byQuote.supported) return { fieldPath: it.fieldPath, status: "supported", correctedValue: it.candidateValue, contradictionDetected: false, evidenceSpecificity: byQuote.specificity, reason: "the cited quote states the value" };
        const contextText = it.context.map((c) => c.text).join(" ");
        const byContext = supportedByText(it.fieldPath, it.candidateValue, contextText);
        if (byContext.supported) return { fieldPath: it.fieldPath, status: "partially_supported", correctedValue: it.candidateValue, contradictionDetected: false, evidenceSpecificity: 0.75, reason: "the value appears in the surrounding context but not in the cited quote" };
        const contradiction = byQuote.corrected !== null && JSON.stringify(byQuote.corrected) !== JSON.stringify(it.candidateValue);
        return {
          fieldPath: it.fieldPath,
          status: byQuote.corrected === null ? "unsupported" : "partially_supported",
          correctedValue: byQuote.corrected,
          contradictionDetected: contradiction,
          evidenceSpecificity: byQuote.corrected === null ? 0 : 0.4,
          reason: byQuote.corrected === null ? "the cited quote does not support the value" : "the cited quote suggests a different value",
        };
      });
      return { outcomes, usage: usage(m.verify, JSON.stringify(items), JSON.stringify(outcomes)) };
    },

  };
}
