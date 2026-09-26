// Only expands authored plans. No engine, parser, model provider or database imports.
import fs from "node:fs";
import path from "node:path";
import { FactSchema, SegmentSchema, type Fact, type Segment } from "../../src/lib/domain/evidence";
import {
  documentPages,
  officialForm,
  officialFieldName,
  officialFieldPage,
} from "../../src/lib/config/official-form-fields";
import { FACTS } from "../../src/lib/domain/registry";
import { EngineInputSchema } from "../../src/lib/rules/input";
import { hashObject } from "../../src/lib/hash";
import { type Doc, type Plan } from "../plans/shared";
import { display } from "./doc/display";
import { factQuote, signatureLine } from "./doc/quotes";
export const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
export { display };
/** The signature record a document prints; the intake reads signed/dated from this line. */
export const metadataQuote = (d: Doc) => signatureLine(d);
export const label = (attribute: string) => attribute.split(".").at(-1)!.replaceAll("_", " ");
// A36 locators: AcroForm facts cite the widget's page and field name with the field value; image-only facts cite a page and named region with the value as read, not verbatim.
export function factLocator(
  file: string,
  d: Doc,
  page: number,
  method: "acroform" | "text" | "vision",
  attribute: string,
  value: unknown,
) {
  const spec = officialForm(d.type);
  const field = spec ? officialFieldName(d.type, attribute) : null;
  if (spec && !field) throw Error(`No official field for ${d.id}/${attribute}`);
  const fieldPage = field ? page + officialFieldPage(d.type, field) - 1 : page;
  if (method === "vision")
    return {
      file,
      page: fieldPage,
      source_block: `page-${fieldPage}`,
      quote: display(value),
      region: field ?? label(attribute),
      verbatim: false,
    };
  if (method === "acroform" && field)
    return { file, page: fieldPage, source_block: `field:${field}:0`, quote: display(value) };
  return {
    file,
    page,
    source_block: `${d.id}-page-${page}`,
    quote: factQuote(d, attribute, value),
  };
}
export function metadataLocator(file: string, d: Doc, page: number, vision: boolean) {
  const spec = officialForm(d.type);
  if (!spec) return { file, page, source_block: `${d.id}-page-${page}`, quote: metadataQuote(d) };
  const sigPage = page + officialFieldPage(d.type, spec.signature) - 1;
  const quote = `${spec.signature}: ${d.metadata.signed ? `e-signed / SYNTHETIC-${d.id}` : "blank"}; ${spec.signatureDate}: ${d.metadata.dated ? d.metadata.signature_date : "blank"}`;
  return vision
    ? {
        file,
        page: sigPage,
        source_block: `page-${sigPage}`,
        quote,
        region: spec.signature,
        verbatim: false,
      }
    : { file, page: sigPage, source_block: `field:${spec.signature}:0`, quote };
}
export const groups = (p: Plan) =>
  [...new Set(p.documents.map((d) => d.path))]
    .sort()
    .map((file) => ({ file, docs: p.documents.filter((d) => d.path === file) }));
export function documents(p: Plan) {
  return groups(p).map(({ file, docs }) => {
    const first = docs[0]!;
    const segments: Segment[] = [];
    const facts: Fact[] = [];
    if (!first.unreadable && !first.duplicate_of)
      for (const [index, d] of docs.entries()) {
        const page =
          docs.slice(0, index).reduce((n, d) => n + documentPages(d.type, d.format), 0) + 1;
        const count = documentPages(d.type, first.format);
        const method =
          first.format === "scan_pdf"
            ? "vision"
            : first.format === "acroform_pdf"
              ? "acroform"
              : "text";
        const locator = metadataLocator(file, d, page, method === "vision");
        segments.push(
          SegmentSchema.parse({
            id: d.id,
            document_version_id: file,
            doc_type: d.type,
            party_id: d.party,
            period: d.period ?? null,
            file,
            metadata_locator: locator,
            page_start: page,
            page_end: page + count - 1,
            expected_page_count: count,
            form_revision: null,
            signed: true,
            dated: true,
            signature_date: "2026-08-31",
            document_date: "2026-08-31",
            account_last_four: null,
            ...d.metadata,
            classification_method: "manual",
            classification_confidence: 1,
            status: "confirmed",
            is_current: true,
          }),
        );
        for (const [attribute, value] of Object.entries(d.facts))
          facts.push(
            FactSchema.parse({
              id: `${d.id}:${attribute}`,
              segment_id: d.id,
              subject_party_id: d.party,
              attribute,
              value,
              normalized_value: value,
              unit: FACTS[attribute]!.unit,
              period: d.period ?? null,
              method,
              locator: {
                ...factLocator(file, d, page, method, attribute, value),
                // A workbook value is its own numeric cell; balance-sheet totals sit on sheet 2.
                ...(first.format === "xlsx"
                  ? {
                      quote: display(value),
                      ...(attribute.startsWith("financial.total_")
                        ? { page: 2, source_block: `${d.id}-sheet-2` }
                        : {}),
                    }
                  : {}),
              },
              confidence: 1,
              confidence_components: { authored_fixture: 1 },
              validators_passed: true,
              actor: null,
              audit_event_id: null,
              record_version: 1,
              is_current: true,
            }),
          );
      }
    return {
      file,
      hash: null as string | null,
      bytes: null as number | null,
      format: first.format,
      batch: first.batch,
      pages: docs.reduce((n, d) => n + documentPages(d.type, d.format), 0),
      segments,
      facts,
      planted_items: [...new Set(docs.flatMap((d) => d.tags))].sort((a, b) => a - b),
      faults: p.faults.filter((f) => docs.some((d) => d.id === f.document && !d.duplicate_of)),
      pipeline: {
        duplicate_of: first.duplicate_of
          ? p.documents.find((d) => d.id === first.duplicate_of)!.path
          : null,
        supersedes: docs.flatMap((d) => (d.supersedes ? [d.supersedes] : [])),
        unreadable: !!first.unreadable,
        bundle: docs.length > 1,
        planned_types: docs.map((d) => d.type),
      },
    };
  });
}
export function engineInput(p: Plan, batch: number) {
  const arrived = p.documents.filter((d) => d.batch <= batch);
  const replaced = new Set(arrived.flatMap((d) => (d.supersedes ? [d.supersedes] : [])));
  const files = documents(p).filter((d) => d.batch <= batch);
  const segments = files.flatMap((d) => d.segments).filter((s) => !replaced.has(s.id));
  const ids = new Set(segments.map((s) => s.id));
  const facts = files.flatMap((d) => d.facts).filter((f) => ids.has(f.segment_id));
  return EngineInputSchema.parse({
    profile: p.batches.filter((b) => b.batch <= batch && b.profile).at(-1)?.profile ?? p.profile,
    parties: p.parties,
    ownership: p.ownership,
    as_of: p.as_of,
    segments,
    accepted_facts: facts,
    pending_facts: [],
    tracking: p.tracking.map((rule_id) => ({
      rule_id,
      scope_key: "deal",
      state: "received",
      actor: "synthetic-reviewer",
      note: "Receipt recorded for fixture",
    })),
    manual_confirmations: p.confirmations.map((c) => ({
      rule_id: c.rule,
      scope_key: c.scope,
      period: null,
      key: c.key,
      confirmed: true,
      actor: "synthetic-reviewer",
      note: "Authored fixture confirmation for lender review",
      audit_event_id: `${p.id}:${c.rule}:${c.scope}`,
    })),
    waivers: [],
    evidence_inventory: {
      segment_ids: segments.map((s) => s.id),
      fact_ids: facts.map((f) => f.id),
    },
  });
}
export function expectedFindings(p: Plan, batch: number) {
  return p.batches
    .find((b) => b.batch === batch)!
    .findings.map((f) => ({ ...f, finding_key: hashObject([f.rule_id, f.scope_key, f.period]) }))
    .sort((a, b) => a.finding_key.localeCompare(b.finding_key));
}
export function writeTruth(
  p: Plan,
  root: string,
  rendered?: Map<string, { hash: string; bytes: number; pages: number }>,
) {
  const dir = path.join(root, p.id, "truth");
  fs.mkdirSync(dir, { recursive: true });
  const write = (file: string, data: unknown) => {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, json(data));
  };
  write("deal.json", {
    id: p.id,
    pack: p.pack,
    overlay: p.overlay ?? null,
    as_of: p.as_of,
    profile: p.profile,
    parties: p.parties,
    ownership: p.ownership,
    clean_model: p.model,
    planted_items: p.planted,
    traps: p.traps,
    planted_faults: p.faults,
  });
  write(
    "documents.json",
    documents(p).map((d) => ({ ...d, ...rendered?.get(d.file) })),
  );
  write(
    "expected_review.json",
    p.documents.flatMap((d) => [
      ...(d.unreadable
        ? [{ file: d.path, batch: d.batch, type: "unreadable", planned_type: d.type }]
        : []),
      ...(d.format === "scan_pdf"
        ? [{ file: d.path, batch: d.batch, type: "vision", segment_id: d.id }]
        : []),
      ...p.faults
        .filter((f) => f.document === d.id)
        .map((f) => ({
          file: d.path,
          batch: d.batch,
          type: "extraction_fault",
          segment_id: d.id,
          attribute: f.attribute,
          kind: f.kind,
          expected: f.expected,
        })),
      ...(d.id === "unmatched"
        ? [{ file: d.path, batch: d.batch, type: "unmatched_party", segment_id: d.id }]
        : []),
    ]),
  );
  for (const b of p.batches) {
    write(`batch-${b.batch}/engine_input.json`, engineInput(p, b.batch));
    write(`batch-${b.batch}/expected_checklist.json`, b.checklist);
    write(`batch-${b.batch}/expected_findings.json`, expectedFindings(p, b.batch));
    write(`batch-${b.batch}/resolved_findings.json`, b.resolves);
  }
}
