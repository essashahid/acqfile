import JSZip from "jszip";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { scrubIdentifiers } from "@/lib/domain/evidence";
import type { SnapshotContent, SnapshotDiff } from "./snapshot";

import { sha256 } from "@/lib/hash";
const FIXED_DATE = new Date("2026-09-15T12:00:00.000Z");
/** Identifiers are masked everywhere in generated output (Guardrail 7, A47). */
const mask = (v: unknown) => scrubIdentifiers(String(v ?? ""));
const escape = (v: unknown) =>
  mask(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const table = (headers: string[], rows: unknown[][]) =>
  `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

/** A47: one printable page with status summary, index, missing items, conflicts and change log. */
export function packageReport(content: SnapshotContent, diff: SnapshotDiff) {
  const missing = content.index.filter((r) =>
    ["missing", "received_with_issues", "needs_review"].includes(r.status),
  );
  const conflicts = content.findings.filter(
    (f) => f.type === "conflict" && ["open", "requested"].includes(f.status),
  );
  const half = Math.ceil(content.index.length / 2);
  const index = (rows: SnapshotContent["index"]) =>
    table(
      ["Item", "Party / period", "Status"],
      rows.map((r) => [r.item_id, `${r.party} ${r.period}`, r.status]),
    );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(content.deal.code)} package ${content.number}</title><style>@page{size:A3 landscape;margin:10mm}body{font:10px system-ui;margin:0;color:#111}h1{font-size:18px}h2{font-size:12px;margin:8px 0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:2px;text-align:left;vertical-align:top}.columns{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:14px}footer{margin-top:10px;font-size:9px}</style></head><body>
<h1>${escape(content.deal.code)} · ${escape(content.deal.name)} · Snapshot ${content.number}</h1>
<p>Required rows satisfied or waived: ${content.readiness.satisfied} of ${content.readiness.applicable}. Blockers: ${content.findings.filter((f) => f.severity === "blocker" && ["open", "requested"].includes(f.status)).length}. Files: ${content.manifest.length}. All rules unverified. ${escape(content.created_at)}</p>
<div class="columns"><section><h2>Index</h2>${index(content.index.slice(0, half))}</section><section><h2>Index continued</h2>${index(content.index.slice(half))}</section><section><h2>Missing and incomplete items</h2>${table(
    ["Item", "Party / period", "Status"],
    missing.map((r) => [r.item_id, `${r.party} ${r.period}`, r.status]),
  )}<h2>Conflicts — for lender review</h2>${table(
    ["Rule", "Subject", "Status"],
    conflicts.map((f) => [f.rule_id, `${f.party} ${f.period ?? ""}`, f.status]),
  )}<h2>Change log</h2>${table(
    ["Change", "Count"],
    Object.entries(diff).map(([k, v]) => [k.replaceAll("_", " "), Array.isArray(v) ? v.length : v]),
  )}<p>The workbook contains full item titles, package paths, each conflict's values with file/page/quoted evidence, accepted source records, and the detailed change log.</p></section></div><footer>${escape(content.footer)}</footer></body></html>`;
}

/** A47: tabs Index, Missing items, Conflicts, Source record, Change log, each ending with the footer. */
export function packageWorkbook(content: SnapshotContent, diff: SnapshotDiff) {
  const book = XLSX.utils.book_new();
  book.Props = {
    Title: `${content.deal.code} snapshot ${content.number}`,
    Author: "AcqFile",
    CreatedDate: FIXED_DATE,
    ModifiedDate: FIXED_DATE,
  };
  const add = (name: string, headers: string[], rows: unknown[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...rows.map((r) => r.map(mask)),
      [],
      [content.footer],
    ]);
    sheet["!cols"] = headers.map(() => ({ wch: 26 }));
    XLSX.utils.book_append_sheet(book, sheet, name);
  };
  add(
    "Index",
    [
      "Item",
      "Title",
      "Applies to",
      "Period",
      "Status",
      "Package path",
      "Document date",
      "Open findings",
      "Rule",
      "Original filenames",
      "SHA-256",
    ],
    content.index.map((r) => [
      r.item_id,
      r.item,
      r.party,
      r.period,
      r.status,
      r.package_paths.join("; "),
      r.document_date,
      r.open_findings,
      r.rule_verified,
      r.original_filenames.join("; "),
      r.file_hashes.join("; "),
    ]),
  );
  add(
    "Missing items",
    ["Item", "Title", "Responsible", "Applies to", "Period", "Status", "Why"],
    content.index
      .filter((r) => ["missing", "received_with_issues", "needs_review"].includes(r.status))
      .map((r) => [
        r.item_id,
        r.item,
        content.findings.find((f) => f.rule_id === r.item_id && f.party === r.party)?.party ?? "",
        r.party,
        r.period,
        r.status,
        r.checks
          .filter((c) => c.result !== "pass")
          .map((c) => c.message)
          .join("; "),
      ]),
  );
  add(
    "Conflicts",
    [
      "Finding",
      "Rule",
      "Applies to",
      "Period",
      "Status",
      "Value",
      "File",
      "Page",
      "Quote",
      "Reviewer note",
    ],
    content.findings
      .filter((f) => f.type === "conflict")
      .flatMap((f) =>
        (f.sides.length ? f.sides : [{ value: "", file: "", page: null, quote: "" }]).map((s) => [
          f.finding_key,
          f.rule_id,
          f.party,
          f.period ?? "",
          f.status,
          s.value,
          s.file,
          s.page,
          s.quote,
          f.reason ?? "",
        ]),
      ),
  );
  add(
    "Source record",
    [
      "Fact id",
      "Subject",
      "Attribute",
      "Value",
      "Period",
      "Original filename",
      "Package path",
      "Page",
      "Quote",
      "Method",
      "Confidence",
      "Review status",
      "Reviewer",
      "Reviewed at",
      "File hash",
    ],
    content.source_record.map((f) => [
      f.fact_id,
      f.subject,
      f.attribute,
      f.value,
      f.period,
      f.original_filename,
      f.package_path,
      f.page,
      f.quote,
      f.method,
      f.confidence,
      f.review_status,
      f.reviewer,
      f.reviewed_at,
      f.file_hash,
    ]),
  );
  add(
    "Change log",
    ["At", "Action", "Detail"],
    [
      ["", "newly satisfied", diff.newly_satisfied.join("; ") || "none"],
      ["", "new findings", diff.new_findings.join("; ") || "none"],
      ["", "resolved findings", diff.resolved_findings.join("; ") || "none"],
      ["", "documents added", diff.documents_added.join("; ") || "none"],
      ["", "documents superseded", String(diff.documents_superseded.length)],
      ["", "reviewer corrections", String(diff.reviewer_corrections)],
      ["", "dismissals", diff.dismissals.join("; ") || "none"],
      ["", "waivers", diff.waivers.join("; ") || "none"],
      ...content.change_log.map((e) => [e.at, e.action, e.detail]),
    ],
  );
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}

/** A47: the ZIP is the report, the workbook and the folder tree of renamed copies. Original bytes are unchanged. */
export async function packageZip(dealId: string, snapshotId: string) {
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.id, snapshotId));
  if (!snapshot || snapshot.dealId !== dealId) throw Error("Snapshot not found");
  const content = snapshot.contentJson as SnapshotContent;
  const diff = snapshot.diffJson as SnapshotDiff;
  const zip = new JSZip();
  zip.file("00_Package_Report.html", packageReport(content, diff), { date: FIXED_DATE });
  zip.file("00_Package_Workbook.xlsx", packageWorkbook(content, diff), { date: FIXED_DATE });
  const versions = await db
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId));
  const storage = getStorage();
  for (const entry of content.manifest) {
    const version = versions.find((v) => v.contentHash === entry.sha256);
    if (!version) throw Error("Snapshot original is unavailable");
    const bytes = await storage.get(version.storagePath);
    if (sha256(bytes) !== entry.sha256) throw Error("Snapshot original hash differs");
    zip.file(entry.package_path, bytes, { date: FIXED_DATE });
  }
  return {
    filename: `${content.deal.code}_snapshot_${content.number}.zip`,
    bytes: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX",
    }),
  };
}
