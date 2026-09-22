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

/** Printable multi-page report. Sources remain the original, unchanged files in this ZIP. */
export function packageReport(content: SnapshotContent, diff: SnapshotDiff) {
  const missing = content.index.filter((r) =>
    ["missing", "received_with_issues", "needs_review"].includes(r.status),
  );
  const conflicts = content.findings.filter(
    (f) => f.type === "conflict" && ["open", "requested"].includes(f.status),
  );
  const status = content.preparation;
  const index = content.index.flatMap((r) =>
    (r.segments.length ? r.segments : [null]).map((segment, i) => [
      r.item_id,
      r.item,
      r.party,
      r.period,
      r.status,
      r.decision_reason ?? "",
      r.responsible ?? "Unassigned — needs assignment",
      segment?.originalFile ?? r.original_filenames[i] ?? "",
      segment ? `${segment.page}–${segment.endPage ?? segment.page}` : "",
      segment?.packagePath ?? r.package_paths[i] ?? "",
      segment ? `${segment.page}–${segment.endPage ?? segment.page} (unchanged original)` : "",
    ]),
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(content.deal.code)} package ${content.number}</title><style>@page{size:A3 landscape;margin:14mm}body{font:14px system-ui;margin:24px;color:#111}h1{font-size:24px}h2{font-size:19px;margin-top:28px}table{border-collapse:collapse;width:100%;table-layout:auto}td,th{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}footer{margin-top:24px;font-size:12px}</style></head><body>
<h1>${escape(content.deal.code)} · ${escape(content.deal.name)} · Version ${content.number}</h1>
<p>${escape(content.created_at)} · ${escape(status?.policy ?? "Historical version; preparation boundary was not recorded")}</p>
<h2>${escape(status?.label ?? "Historical preparation status not assessed")}</h2>
<p>Preparation requirements: ${status?.satisfied ?? content.readiness.satisfied} satisfied; ${status?.waived ?? "not recorded"} waived; ${content.readiness.applicable} applicable. Not applicable: ${status?.notApplicable ?? "not recorded"}. All rules unverified.</p>
${table(
  ["Unresolved preparation work"],
  (status?.unresolved ?? []).map((issue) => [issue]),
)}
<h2>Later lender work</h2>${table(
    ["Item", "Title", "Subject", "Responsible", "Status"],
    (status?.later ?? []).map((r) => [r.item, r.title, r.subject, r.responsible, r.status]),
  )}
<h2>Index</h2>${table(["Item", "Title", "Subject", "Period", "Status", "Decision reason", "Responsible", "Original source file", "Original pages", "Exported path", "Output pages"], index)}
<h2>Document segments</h2><p>Files retain their original bytes and page numbering. A bundled file may be referenced by more than one requirement.</p>${table(
    [
      "Segment",
      "Type",
      "Subject",
      "Original source file",
      "Original pages",
      "Exported path",
      "Output pages",
    ],
    (content.segment_locations ?? []).map((r) => [
      r.id,
      r.type,
      r.subject,
      r.original_filename,
      `${r.page_start}–${r.page_end}`,
      r.package_path,
      `${r.page_start}–${r.page_end}`,
    ]),
  )}
<h2>Missing and incomplete items</h2>${table(
    [
      "Item",
      "Title",
      "Subject",
      "Responsible provider / role",
      "Period",
      "Stage",
      "Status",
      "What is needed",
    ],
    missing.map((r) => [
      r.item_id,
      r.item,
      r.party,
      r.responsible ?? "Unassigned — needs assignment",
      r.period,
      r.submission_stage ?? "unknown",
      r.status,
      r.checks
        .filter((c) => c.result !== "pass")
        .map((c) => c.message)
        .join("; "),
    ]),
  )}
<h2>Conflicts — for lender review</h2>${conflicts
    .map(
      (f) =>
        `<h3>${escape(f.title ?? f.message ?? f.rule_id)}</h3><p>${escape(f.description ?? f.message)} ${escape(f.message)}</p><p>${escape(f.rule_id)} · ${escape(f.party)} · ${escape(f.period ?? "")} · Responsible: ${escape(f.responsible ?? "Unassigned — needs assignment")} · ${escape(f.status)}</p>${table(
          [
            "Source value or relationship detail",
            "Original file",
            "Supporting page",
            "Quoted evidence",
            "Exported path",
          ],
          f.sides.map((side) => [
            side.value,
            side.file,
            side.page,
            side.quote,
            side.package_path ?? "",
          ]),
        )}<p>${escape(f.reason ?? "")}</p>`,
    )
    .join("")}
<h2>Files in this version</h2><ul>${content.manifest.map((m) => `<li><a href="${escape(m.package_path.split("/").map(encodeURIComponent).join("/"))}">${escape(m.package_path)}</a> — ${escape(m.original_filename)}</li>`).join("")}</ul>
<h2>Change log</h2>${table(
    ["Change", "Detail"],
    Object.entries(diff).map(([k, v]) => [
      k.replaceAll("_", " "),
      Array.isArray(v) ? v.join("; ") : v,
    ]),
  )}
<p>The workbook includes the current source record, supporting pages and review history. This version records the evidence at the date above; it does not assert the current deal is ready after later changes.</p><footer>${escape(content.footer)}</footer></body></html>`;
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
      ...rows.map((r) => r.map((value) => (typeof value === "number" ? value : mask(value)))),
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
      "Responsible provider / role",
      "Submission stage",
      "Decision reason",
      "Original page start",
      "Original page end",
      "Output pages",
    ],
    content.index.flatMap((r) =>
      (r.segments.length ? r.segments : [null]).map((segment, i) => [
        r.item_id,
        r.item,
        r.party,
        r.period,
        r.status,
        segment?.packagePath ?? r.package_paths[i] ?? "",
        r.document_date,
        r.open_findings,
        r.rule_verified,
        segment?.originalFile ?? r.original_filenames[i] ?? "",
        r.file_hashes[i] ?? "",
        r.responsible ?? "Unassigned — needs assignment",
        r.submission_stage ?? "unknown",
        r.decision_reason ?? "",
        segment?.page ?? "",
        segment?.endPage ?? segment?.page ?? "",
        segment ? `${segment.page}–${segment.endPage ?? segment.page} (unchanged original)` : "",
      ]),
    ),
  );
  add(
    "Missing items",
    ["Item", "Title", "Responsible", "Applies to", "Period", "Status", "Why"],
    content.index
      .filter((r) => ["missing", "received_with_issues", "needs_review"].includes(r.status))
      .map((r) => [
        r.item_id,
        r.item,
        r.responsible ?? "Unassigned — needs assignment",
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
      "Issue title",
      "Description / question",
      "Responsible provider / role",
      "Package path",
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
          f.title ?? f.message,
          f.description ?? f.message,
          f.responsible ?? "Unassigned — needs assignment",
          "package_path" in s ? s.package_path : "",
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
      "Record version",
      "Audit event",
      "Support kind",
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
      f.record_version ?? "",
      f.audit_event ?? "",
      f.support_kind ?? "",
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
  add(
    "Segment locations",
    [
      "Segment",
      "Type",
      "Subject",
      "Original filename",
      "Original page start",
      "Original page end",
      "Package path",
      "Output page start",
      "Output page end",
    ],
    (content.segment_locations ?? []).map((r) => [
      r.id,
      r.type,
      r.subject,
      r.original_filename,
      r.page_start,
      r.page_end,
      r.package_path,
      r.page_start,
      r.page_end,
    ]),
  );
  add(
    "Status summary",
    ["Section", "Item", "Subject", "Responsible", "Status / detail"],
    [
      [
        "Policy",
        "",
        "",
        "",
        content.preparation?.policy ?? "Historical preparation boundary not recorded",
      ],
      ["Version", content.number, "", "", content.created_at],
      ["Preparation", "", "", "", content.preparation?.label ?? "Historical status not assessed"],
      ["Satisfied", "", "", "", content.preparation?.satisfied ?? content.readiness.satisfied],
      ["Waived", "", "", "", content.preparation?.waived ?? "not recorded"],
      ["Not applicable", "", "", "", content.preparation?.notApplicable ?? "not recorded"],
      ...(content.preparation?.unresolved ?? []).map((text) => [
        "Unresolved preparation",
        "",
        "",
        "",
        text,
      ]),
      ...(content.preparation?.later ?? []).map((r) => [
        "Later lender work",
        r.title,
        r.subject,
        r.responsible,
        r.status,
      ]),
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
