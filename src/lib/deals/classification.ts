import { z } from "zod";
import {
  DocumentTypeSchema,
  DOCUMENT_TYPES,
  type DocumentType,
} from "@/lib/domain/registry";
import { DOCUMENT_SIGNATURES } from "@/lib/config/document-signatures";
import { officialForm } from "@/lib/config/official-form-fields";
import { normalizeName } from "@/lib/rules/expressions";
import type { Parsed } from "./parse";
export const CandidateSchema = z.object({
  page_start: z.number().int().positive(),
  page_end: z.number().int().positive(),
  doc_type: DocumentTypeSchema,
  alternatives: z.array(DocumentTypeSchema),
  party_name: z.string().nullable(),
  period_raw: z.string().nullable(),
  period: z.string().nullable(),
  form_revision: z.string().nullable(),
  signed: z.boolean().nullable(),
  dated: z.boolean().nullable(),
  signature_date: z.iso.date().nullable(),
  document_date: z.iso.date().nullable(),
  expected_page_count: z.number().int().positive().nullable(),
  account_last_four: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  quote: z.string(),
  quote_page: z.number().int().positive(),
  evidence: z.array(
    z.object({
      field: z.string(),
      page: z.number().int().positive(),
      quote: z.string(),
    }),
  ),
  uncertain: z.boolean(),
});
export type Candidate = z.infer<typeof CandidateSchema>;
export type Classified = Candidate & {
  classification_method: "signature" | "llm" | "manual";
  party_id: string | null;
  assignment: "matched" | "unknown" | "outside" | "ambiguous";
  status: "proposed" | "confirmed" | "rejected";
};
export const ClassificationSchema = z.object({
  segments: z.array(CandidateSchema).min(1),
});
export function validateBoundaries(segments: Candidate[], pages: number) {
  const sorted = [...segments].sort((a, b) => a.page_start - b.page_start);
  let end = 0;
  for (const s of sorted) {
    if (
      s.page_start !== end + 1 ||
      s.page_end < s.page_start ||
      s.page_end > pages
    )
      throw Error("Segments must cover every page exactly once");
    end = s.page_end;
  }
  if (end !== pages) throw Error("Segments do not cover every page");
  return sorted;
}
function signature(text: string): DocumentType | null {
  const header = text.split("\n").slice(0, 8).join(" ").toLowerCase();
  const scored = DOCUMENT_TYPES.map((type) => {
    const sig = DOCUMENT_SIGNATURES[type];
    const score = Math.max(
      0,
      ...sig.forms.map((s) => (header.includes(s.toLowerCase()) ? 4 : 0)),
      ...sig.titles.map((s) => (header.includes(s.toLowerCase()) ? 3 : 0)),
      ...sig.omb.map((s) => (header.includes(s) ? 2 : 0)),
    );
    return { type, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > (scored[1]?.score ?? 0)
    ? scored[0].type
    : null;
}
const line = (text: string, label: string) =>
  new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, "i").exec(text)?.[1]?.trim() ??
  null;
export function metadata(
  parsed: Parsed,
  start: number,
  end: number,
  type: DocumentType,
): Candidate {
  const blocks = parsed.blocks.filter((b) => b.page >= start && b.page <= end);
  const text = blocks
    .filter((b) => b.kind !== "field")
    .map((b) => b.text)
    .join("\n");
  const spec = officialForm(type);
  const field = (name: string) =>
    blocks.find((b) => b.kind === "field" && b.name === name && b.text)?.text ??
    null;
  const party_name =
    (spec ? field(spec.name) : null) ??
    line(text, "Named party") ??
    line(text, "Name");
  const period_raw = line(text, "Period");
  const period =
    period_raw && /^\d{4}(?:-\d{2})?$/.test(period_raw) ? period_raw : null;
  const signature = /Signature:\s*(e-signed|_+);\s*Date:\s*([\d-]+|_+)/i.exec(
    text,
  );
  const signatureField = spec ? field(spec.signature) : null;
  const dateField = spec ? field(spec.signatureDate) : null;
  const signed = signature
    ? signature[1]!.toLowerCase() === "e-signed"
    : signatureField && /e-signed|envelope/i.test(signatureField)
      ? true
      : null;
  const dated = signature
    ? !signature[2]!.startsWith("_")
    : dateField && z.iso.date().safeParse(dateField).success
      ? true
      : null;
  const date =
    dateField && z.iso.date().safeParse(dateField).success
      ? dateField
      : signature?.[2];
  const signature_date =
    date && z.iso.date().safeParse(date).success ? date : null;
  const document = line(text, "Document date");
  const document_date =
    document && z.iso.date().safeParse(document).success ? document : null;
  const pageCounts = [...text.matchAll(/Page\s+\d+\s+of\s+(\d+)/gi)].map((m) =>
    Number(m[1]),
  );
  const expected_page_count = pageCounts.length
    ? Math.max(...pageCounts)
    : null;
  const quote = signature?.[0] ?? blocks[0]?.text.slice(0, 180) ?? "";
  const quote_page = blocks.find((b) => b.text.includes(quote))?.page ?? start;
  const evidence = Object.entries({
    party_name,
    period: period_raw,
    form_revision:
      type === "SBA_1919" && text.includes("02/2025") ? "02/2025" : null,
    signed: signature?.[0],
    dated: signature?.[0],
    signature_date,
    document_date,
    account_last_four: line(text, "Account ending"),
  }).flatMap(([field, value]) => {
    if (!value) return [];
    const block = blocks.find((b) => b.text.includes(value));
    return block ? [{ field, page: block.page, quote: value }] : [];
  });
  return CandidateSchema.parse({
    page_start: start,
    page_end: end,
    doc_type: type,
    alternatives: [],
    party_name,
    period_raw,
    period,
    form_revision:
      type === "SBA_1919" && /02\/2025/.test(text) ? "02/2025" : null,
    signed,
    dated,
    signature_date,
    document_date,
    expected_page_count,
    account_last_four: line(text, "Account ending"),
    quote,
    quote_page,
    evidence,
    uncertain: false,
  });
}
export function deterministicSegments(parsed: Parsed): Candidate[] | null {
  if (parsed.status !== "parsed" || parsed.blocks.some((b) => b.image_only))
    return null;
  const fields = new Set(
    parsed.blocks.filter((b) => b.kind === "field").map((b) => b.name),
  );
  const official = DOCUMENT_TYPES.filter(
    (t) =>
      DOCUMENT_SIGNATURES[t].acroform.length &&
      DOCUMENT_SIGNATURES[t].acroform.every((name) => fields.has(name)),
  );
  if (official.length === 1) {
    // AcroForm fields identify a form, not necessarily the whole uploaded packet.
    const anotherType = parsed.blocks.some(
      (b) =>
        b.kind === "page" &&
        signature(b.text) &&
        signature(b.text) !== official[0],
    );
    if (anotherType) return null;
    return [metadata(parsed, 1, parsed.pages, official[0]!)];
  }
  if (parsed.kind !== "pdf") {
    const type = signature(parsed.blocks.map((b) => b.text).join("\n"));
    return type ? [metadata(parsed, 1, parsed.pages, type)] : null;
  }
  const output: Candidate[] = [];
  for (let page = 1; page <= parsed.pages; page++) {
    const text = parsed.blocks
      .filter((b) => b.page === page && b.kind === "page")
      .map((b) => b.text)
      .join("\n");
    const type = signature(text);
    if (!type) return null;
    const current = metadata(parsed, page, page, type);
    const previous = output.at(-1);
    const restart = /Page\s+1\s+of\s+\d+/i.test(text);
    if (
      previous &&
      previous.doc_type === type &&
      previous.party_name === current.party_name &&
      previous.period === current.period &&
      !restart
    ) {
      output[output.length - 1] = metadata(
        parsed,
        previous.page_start,
        page,
        type,
      );
    } else output.push(current);
  }
  return validateBoundaries(output, parsed.pages);
}
export type AssignmentParty = {
  id: string;
  legalName: string;
  nameVariants: unknown;
  identifierHmac: string | null;
};
export function assignParty(
  candidate: Candidate,
  parsed: Parsed,
  parties: AssignmentParty[],
) {
  const identifiers = parsed.identifiers.filter(
    (i) =>
      i.page >= candidate.page_start &&
      i.page <= candidate.page_end &&
      i.kind !== "account",
  );
  const idMatches = parties.filter(
    (p) =>
      p.identifierHmac && identifiers.some((i) => i.hmac === p.identifierHmac),
  );
  const name = normalizeName(candidate.party_name ?? "");
  const matches = idMatches.length
    ? idMatches
    : parties.filter((p) =>
        [
          p.legalName,
          ...(Array.isArray(p.nameVariants) ? p.nameVariants : []),
        ].some(
          (n) => typeof n === "string" && name && normalizeName(n) === name,
        ),
      );
  return {
    party_id: matches.length === 1 ? matches[0]!.id : null,
    assignment:
      matches.length === 1
        ? ("matched" as const)
        : matches.length > 1
          ? ("ambiguous" as const)
          : candidate.party_name
            ? ("outside" as const)
            : ("unknown" as const),
  };
}
