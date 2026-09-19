import * as XLSX from "xlsx";
import { stableStringify } from "@/lib/hash";
import type { ResolvedPack } from "./schema";
export const footer = (pack: ResolvedPack) => `Prepared from documents supplied by the parties. Flags are preparation aids for lender review. They are not credit, legal, tax or eligibility determinations. Rule pack: ${pack.pack} ${pack.version}. Rules marked unverified have not been confirmed by a lender.`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function reviewRows(pack: ResolvedPack): string[][] {
  return [["Pack", "Overlay", "Rule", "Title", "Plain-English description", "Scope", "Period", "Required", "Parameters", "Source class", "Source", "URL", "Verified", "SME correction"], ...[...pack.items, ...pack.consistency].map(r => [pack.version, pack.overlay ?? "None", r.id, r.title, `${r.description} ${r.checks.map(c => c.message).join('; ')}`, r.scope, r.period_requirement ?? "None", String(r.required), stableStringify(pack.parameters), r.source_ref.class, r.source_ref.citation, r.source_ref.url ?? "", "false", ""])];
}
export function exportReview(packs: ResolvedPack[]) {
  const book = XLSX.utils.book_new();
  const sections = packs.map((pack, index) => {
    const rows = reviewRows(pack), notice = footer(pack);
    const sheet = XLSX.utils.aoa_to_sheet([...rows, [], [notice]]);
    sheet['!cols'] = rows[0]!.map((_, i) => ({ wch: i === 4 || i === 10 ? 80 : i === 8 ? 45 : 22 }));
    XLSX.utils.book_append_sheet(book, sheet, `${index + 1}-${pack.version.slice(4)}${pack.overlay ? '-SLA' : ''}`);
    return `<section><h2>${escape(pack.version)} · ${escape(pack.overlay ?? 'Base')}</h2><p>All rules unverified. Content hash: ${pack.content_hash}</p><table><thead><tr>${rows[0]!.map(v => `<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(v => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><footer>${escape(notice)}</footer></section>`;
  });
  return { xlsx: XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer, html: `<!doctype html><html lang="en"><meta charset="utf-8"><title>AcqFile rule review</title><style>body{font:14px system-ui;margin:24px;color:#172b36}table{border-collapse:collapse}td,th{border:1px solid #cad5db;padding:8px;text-align:left;vertical-align:top}th{background:#edf5f3}footer{margin:24px 0}section{margin-bottom:48px}</style><h1>AcqFile rule review</h1>${sections.join('')}</html>` };
}
