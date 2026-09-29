import JSZip from "jszip";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { scrubIdentifiers } from "@/lib/domain/evidence";
import { PRODUCT_NAME } from "@/lib/product";
import { documentName, responsibleName } from "@/lib/staff/labels";
import type { SnapshotContent, SnapshotDiff } from "./snapshot";
import type { FrozenAnswer, FrozenSource } from "./answers";
import {
  ANSWER_MEANING,
  actionLabel,
  dateTimeLabel,
  laterWorkDetail,
  laterWorkStatus,
  problemTitle,
  statusLabel,
  typedValue,
} from "./labels";
import { FACTS } from "@/lib/domain/registry";

/** A stored fact value as the reader sees it: typed, with keyed hashes and references left out. */
const sourceValue = (attribute: string, stored: string) => {
  let value: unknown = stored;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "string") value = parsed;
  } catch {
    /* plain text */
  }
  return typedValue(value, FACTS[attribute]?.value_type);
};
import { packageReportV1, packageWorkbookV1 } from "./package-v1";
import { packageReportV2, packageWorkbookV2 } from "./package-v2";
import { layoutSheet, polishWorkbook, type SheetShape } from "./workbook-layout";
import { withoutInternalIds } from "./event-detail";

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

const table = (headers: string[], rows: unknown[][], empty = "None.", className = "") =>
  rows.length
    ? `<table${className ? ` class="${className}"` : ""}><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : `<p>${escape(empty)}</p>`;

const UNASSIGNED = "Unassigned — needs assignment";
const who = (role: string | undefined) =>
  !role || role === UNASSIGNED ? UNASSIGNED : responsibleName(role);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
};

/** A stored comparison value as a reader sees it: amounts with separators, dates with the
 * year, and document metadata as words. Internal identifiers never appear. */
export function readableValue(raw: string): string {
  let value: unknown = raw;
  if (/^[[{]/.test(raw.trim()))
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  const one = (v: unknown): string => {
    if (typeof v === "number") return new Intl.NumberFormat("en-US").format(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return day(v);
      if (/^-?\d+(\.\d+)?$/.test(v)) return new Intl.NumberFormat("en-US").format(Number(v));
      return v;
    }
    if (v === null || v === undefined) return "Not stated";
    if (Array.isArray(v)) return v.map(one).join("; ");
    return Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !/(^|_)id$|hash|hmac/i.test(k))
      .map(([k, x]) => `${k.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())}: ${one(x)}`)
      .join("; ");
  };
  return one(value);
}

/** A stored change entry ("GUA-05 · Jaylan Heller · needs_review") with its code in words. */
const changeEntry = (entry: string) =>
  entry
    .split(" · ")
    .map((part, i, all) =>
      i === all.length - 1 && /^[a-z_]+$/.test(part) ? statusLabel(part) : part,
    )
    .join(" · ");
const DIFF_ORDER: [keyof SnapshotDiff, string][] = [
  ["newly_satisfied", "Newly satisfied"],
  ["new_findings", "New findings"],
  ["resolved_findings", "Resolved findings"],
  ["documents_added", "Documents added"],
  ["documents_superseded", "Documents superseded"],
  ["reviewer_corrections", "Reviewer corrections"],
  ["dismissals", "Dismissals"],
  ["waivers", "Waivers"],
];
const diffRows = (diff: SnapshotDiff, count = false) =>
  DIFF_ORDER.map(([key, label]) => {
    const v = diff[key];
    return [
      label,
      Array.isArray(v)
        ? count && key === "documents_superseded"
          ? String(v.length)
          : v.map(changeEntry).join("; ") || "None"
        : String(v),
    ];
  });

const sourceText = (s: FrozenSource) =>
  `${s.document}: ${s.value} — ${s.original_file}${s.page ? `, page ${s.page}` : ""}${s.package_path ? ` (${s.package_path})` : ""}`;

type Finding = SnapshotContent["findings"][number];
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const digits = (s: string) => s.replace(/[^\d.]/g, "");
const isQuestion = (f: Finding) =>
  (f.type === "conflict" && ["open", "requested"].includes(f.status)) ||
  (!!f.answer && ["open", "requested"].includes(f.status));

/** What must happen for the finding to close, from its frozen status and answer. A preferred
 * value never closes a disagreement; only documents that agree do. */
export function requiredAction(f: Finding): string {
  if (f.status === "resolved")
    return f.type === "conflict" ? "None. The cited sources now agree." : "None. Resolved.";
  if (f.status === "dismissed") return `None. Dismissed${f.reason ? `: ${f.reason}` : "."}`;
  if (f.status === "waived") return `None. Waived${f.reason ? `: ${f.reason}` : "."}`;
  const same = f.compared
    ? `so the cited sources show the same ${f.compared}`
    : "so the cited sources agree";
  const target = f.compared ?? "value";
  const differ = `then correct the documents that differ, or provide updated documents, ${same}.`;
  const a = f.answer;
  if (a?.state === "current" && a.selected_value) {
    // In the order the comparison lists them, which is the order the rule names the documents.
    const order = f.sides.map((s) => s.source);
    const documents = [
      ...new Set(
        [...a.corrections_needed]
          .sort(
            (x, y) => (order.indexOf(x.document) + 1 || 99) - (order.indexOf(y.document) + 1 || 99),
          )
          .map((s) => lowerFirst(s.document)),
      ),
    ];
    if (documents.length)
      return `Correct the ${listOf(documents)}, or provide updated documents, ${same}.`;
    if (
      f.sides.some(
        (s) => s.source === "Deal profile" && digits(s.display ?? s.value) !== digits(a.selection),
      )
    )
      return `Update the deal profile, or provide updated documents, ${same}.`;
    return `Confirm the cited sources, ${same}.`;
  }
  if (a?.state === "current")
    return `No value was chosen. Confirm the correct ${target}, ${differ}`;
  if (a)
    return `The recorded answer refers to earlier evidence. Confirm the correct ${target} against the current documents, ${differ}`;
  return `Confirm which ${target} is correct, ${differ}`;
}

function answerHtml(answer: FrozenAnswer | null | undefined) {
  if (!answer)
    return `<p class="answer none">No answer was recorded for this question when this version was created.</p>`;
  const rows: [string, string][] = [
    [
      "Answer status",
      answer.state === "current" ? "Answer recorded (current)" : "Not current: earlier evidence",
    ],
    ["Recorded selection", answer.selection],
    ["Explanation", answer.explanation || "None given"],
    ["Recorded by", answer.recorded_by],
    ["Recorded at", dateTimeLabel(answer.recorded_at)],
  ];
  if (answer.state === "current") {
    rows.push(["Supporting sources", answer.supporting.map(sourceText).join("\n") || "None"]);
    rows.push([
      "Corrections still needed",
      answer.corrections_needed.map(sourceText).join("\n") || "None",
    ]);
    rows.push([
      "Supporting documents corrected",
      answer.corrections_needed.length
        ? "No. The documents still disagree; the answer does not change them."
        : "Not needed for the documents cited.",
    ]);
  }
  return `<div class="answer"><p><strong>${escape(answer.summary)}</strong></p><dl>${rows
    .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v).replaceAll("\n", "<br>")}</dd>`)
    .join("")}</dl></div>`;
}

const kindOfPath = (path: string) => {
  const file = path.split("/").at(-1) ?? "";
  if (file.startsWith("SUPPORTING_")) return "supporting";
  if (file.startsWith("NOT_REQUIRED_")) return "not_required";
  if (file.startsWith("UNFILED_")) return "unfiled";
  if (path.startsWith("Z_History/")) return "history";
  return "filed";
};

type Group = NonNullable<NonNullable<SnapshotContent["preparation"]>["groups"]>[number];
/** An outstanding group as the reader sees it: a disagreement by its problem and action. */
const groupRow = (g: Group, findings: Map<string, Finding>) => {
  const f = g.finding_key ? findings.get(g.finding_key) : undefined;
  if (f?.type === "conflict")
    return {
      title: f.problem_title ?? problemTitle(g.title, f.status),
      status: statusLabel(f.type),
      reasons: [requiredAction(f)],
    };
  return { title: g.title, status: g.status, reasons: g.reasons };
};

/** What a missing or incomplete row needs; later lender work reads from its tracking. */
const rowNeeds = (r: SnapshotContent["index"][number]) =>
  r.submission_stage === "later_lender" && r.tracking !== undefined
    ? laterWorkDetail({
        status: r.status,
        tracking: r.tracking,
        checks: r.checks,
        filed: r.package_paths.length > 0,
        decision_reason: r.decision_reason,
      })
    : r.checks
        .filter((c) => c.result !== "pass")
        .map((c) => c.message)
        .join("; ");

const INITIAL =
  "This is the first version of this lender file, so there is no previous version to compare with.";

/** Printable multi-page report. Sources remain the original, unchanged files in this ZIP. */
export function packageReport(content: SnapshotContent, diff: SnapshotDiff) {
  if (!content.format) return packageReportV1(content, diff);
  if (content.format === 2) return packageReportV2(content, diff);
  const status = content.preparation;
  const byKey = new Map(content.findings.map((f) => [f.finding_key, f]));
  const missing = content.index.filter((r) =>
    ["missing", "received_with_issues", "needs_review"].includes(r.status),
  );
  const questions = content.findings.filter(isQuestion);
  const index = content.index.flatMap((r) =>
    (r.segments.length ? r.segments : [null]).map((segment, i) => [
      r.item_id,
      r.item,
      r.party,
      r.period,
      statusLabel(r.status),
      r.decision_reason ?? "",
      who(r.responsible),
      segment?.originalFile ?? r.original_filenames[i] ?? "",
      segment ? `${segment.page}–${segment.endPage ?? segment.page}` : "",
      segment?.packagePath ?? r.package_paths[i] ?? "",
    ]),
  );
  const extra = (content.segment_locations ?? []).filter((s) =>
    ["supporting", "not_required", "unfiled"].includes(kindOfPath(s.package_path)),
  );
  const segmentFiles = new Set((content.segment_locations ?? []).map((s) => s.package_path));
  const unfiledWithoutSegments = content.manifest.filter(
    (m) => kindOfPath(m.package_path) === "unfiled" && !segmentFiles.has(m.package_path),
  );
  const extraKind = {
    supporting: "Additional supporting document",
    not_required: "Not required",
    unfiled: "Unfiled",
  } as Record<string, string>;
  const groups = (status?.groups ?? []).map((g) => groupRow(g, byKey));
  const initial = content.previous_version == null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(content.deal.code)} lender file version ${content.number}</title><style>@page{size:A3 landscape;margin:14mm}body{font:14px system-ui;margin:24px;color:#111}h1{font-size:24px}h2{font-size:19px;margin-top:28px}h3{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%;table-layout:auto}td,th{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eef1f5;overflow-wrap:normal}table.compare td:nth-child(2){white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid}.answer{border-left:4px solid #12355b;background:#f4f6f9;padding:10px 14px;margin:12px 0}.answer.none{border-color:#ccc;background:#fafafa}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:8px 0 0}dt{font-weight:600}dd{margin:0}.action{font-weight:600}footer{margin-top:24px;font-size:12px}</style></head><body>
<h1>${escape(content.deal.code)} · ${escape(content.deal.name)} · Version ${content.number}</h1>
<p>Created ${escape(dateTimeLabel(content.created_at))} · ${escape(status?.policy ?? "Preparation boundary was not recorded")}${initial ? " · Initial version" : ` · Compared with version ${content.previous_version}`}</p>
<h2>${escape(status?.label ?? "Preparation status not assessed")}</h2>
<p>Preparation requirements: ${status?.satisfied ?? content.readiness.satisfied} satisfied; ${status?.waived ?? "not recorded"} waived; ${content.readiness.applicable} applicable. Not applicable: ${status?.notApplicable ?? "not recorded"}. All rules unverified.</p>
<h2>Unresolved preparation work</h2>${table(
    ["Item", "Applies to", "Period", "Status", "What is needed"],
    (status?.groups ?? []).map((g, i) => [
      groups[i]!.title,
      g.subject,
      g.period,
      groups[i]!.status,
      groups[i]!.reasons.join("\n"),
    ]),
    "No outstanding preparation work.",
  )}
<h2>Later lender work</h2><p>Items the lender orders or obtains itself. They do not hold up preparation.</p>${table(
    ["Item", "Title", "Subject", "Responsible", "Status", "What is needed"],
    (status?.later ?? []).map((r) => [
      r.item,
      r.title,
      r.subject,
      who(r.responsible),
      r.tracking_label ?? laterWorkStatus(r.status, r.tracking),
      r.detail ?? "",
    ]),
  )}
<h2>Questions and recorded answers — for lender review</h2>
<p>${escape(ANSWER_MEANING)}</p>${
    questions
      .map((f) => {
        const heading = f.problem_title ?? f.title ?? f.message ?? f.rule_id;
        return `<h3>${escape(heading)}</h3><p>${escape(f.rule_id)} · ${escape(f.party)}${f.period ? ` · ${escape(f.period)}` : ""} · Responsible: ${escape(who(f.responsible))} · ${escape(statusLabel(f.status))} · ${escape(statusLabel(f.type))}</p>${
          f.title && f.title !== heading ? `<p>Question asked: ${escape(f.title)}</p>` : ""
        }<p class="action">Required action: ${escape(requiredAction(f))}</p>${table(
          [
            "Source",
            "Value",
            "Original file",
            "Supporting page",
            "Quoted evidence",
            "Exported path",
          ],
          f.sides.map((side) => [
            side.source ?? "",
            side.display ?? readableValue(side.value),
            side.file,
            side.page ?? "",
            side.quote,
            side.package_path ?? "",
          ]),
          "No compared values were recorded.",
          "compare",
        )}${answerHtml(f.answer)}${f.reason ? `<p>Reviewer note: ${escape(f.reason)}</p>` : ""}`;
      })
      .join("") || "<p>No open questions.</p>"
  }
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
      who(r.responsible),
      r.period,
      statusLabel(r.submission_stage ?? "unknown"),
      r.submission_stage === "later_lender" && r.tracking !== undefined
        ? laterWorkStatus(r.status, r.tracking)
        : statusLabel(r.status),
      rowNeeds(r),
    ]),
  )}
<h2>Index</h2>${table(["Item", "Title", "Subject", "Period", "Status", "Decision reason", "Responsible", "Original source file", "Original pages", "Exported path"], index)}
<h2>Documents outside the checklist</h2><p>Additional supporting documents keep their filed type, person and period. Unfiled documents have no confirmed filing yet.</p>${table(
    ["Kind", "Type", "Applies to", "Original source file", "Original pages", "Exported path"],
    [
      ...extra.map((s) => [
        extraKind[kindOfPath(s.package_path)],
        documentName(s.type),
        s.subject,
        s.original_filename,
        `${s.page_start}–${s.page_end}`,
        s.package_path,
      ]),
      ...unfiledWithoutSegments.map((m) => [
        "Unfiled",
        "Not filed",
        "",
        m.original_filename,
        "",
        m.package_path,
      ]),
    ],
  )}
<h2>Document segments</h2><p>Files retain their original bytes and page numbering. A bundled file may be referenced by more than one requirement.</p>${table(
    ["Type", "Subject", "Original source file", "Original pages", "Exported path"],
    (content.segment_locations ?? []).map((r) => [
      documentName(r.type),
      r.subject,
      r.original_filename,
      `${r.page_start}–${r.page_end}`,
      r.package_path,
    ]),
  )}
<h2>Files in this version</h2><ul>${content.manifest.map((m) => `<li><a href="${escape(m.package_path.split("/").map(encodeURIComponent).join("/"))}">${escape(m.package_path)}</a> — ${escape(m.original_filename)}</li>`).join("")}</ul>
${
  initial
    ? `<h2>Initial version</h2><p>${escape(INITIAL)} The workbook’s Change log sheet keeps the file’s recorded history up to this version.</p>`
    : `<h2>Changes since version ${content.previous_version}</h2>${table(["Change", "Detail"], diffRows(diff))}`
}
<p>The workbook includes the source record, supporting pages, recorded answers and review history. This version records the evidence at the date above; it does not assert the current deal is ready after later changes.</p><footer>${escape(content.footer)}</footer></body></html>`;
}

/** A47: tabs Index, Missing items, Conflicts, Source record, Change log, each ending with the footer. */
export function packageWorkbook(content: SnapshotContent, diff: SnapshotDiff) {
  if (!content.format) return packageWorkbookV1(content, diff);
  if (content.format === 2) return packageWorkbookV2(content, diff);
  const book = XLSX.utils.book_new();
  book.Props = {
    Title: `${content.deal.code} lender file version ${content.number}`,
    Author: PRODUCT_NAME,
    CreatedDate: FIXED_DATE,
    ModifiedDate: FIXED_DATE,
  };
  const shapes: SheetShape[] = [];
  const byKey = new Map(content.findings.map((f) => [f.finding_key, f]));
  const add = (name: string, headers: string[], rows: unknown[][], notes: string[] = []) => {
    const cells = rows.map((r) =>
      r.map((value) => (typeof value === "number" ? value : withoutInternalIds(mask(value)))),
    );
    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...cells,
      [],
      ...notes.map((n) => [n]),
      ...(notes.length ? [[]] : []),
      [content.footer],
    ]);
    layoutSheet(sheet, headers, cells);
    shapes.push({ name, headers, rows: cells });
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
        statusLabel(r.status),
        segment?.packagePath ?? r.package_paths[i] ?? "",
        r.document_date ? day(r.document_date) : "",
        r.open_findings,
        "Unverified",
        segment?.originalFile ?? r.original_filenames[i] ?? "",
        r.file_hashes[i] ?? "",
        who(r.responsible),
        statusLabel(r.submission_stage ?? "unknown"),
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
        who(r.responsible),
        r.party,
        r.period,
        r.submission_stage === "later_lender" && r.tracking !== undefined
          ? laterWorkStatus(r.status, r.tracking)
          : statusLabel(r.status),
        rowNeeds(r),
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
      "Issue title",
      "Description / question",
      "Source",
      "Value",
      "File",
      "Page",
      "Quote",
      "Package path",
      "Required action",
      "Recorded answer",
      "Answer status",
      "Reviewer note",
      "Responsible provider / role",
    ],
    content.findings
      .filter((f) => f.type === "conflict")
      .flatMap((f, n) =>
        (f.sides.length ? f.sides : [null]).map((s) => [
          n + 1,
          f.rule_id,
          f.party,
          f.period ?? "",
          statusLabel(f.status),
          f.problem_title ?? f.title ?? f.message,
          f.title ?? f.message,
          s?.source ?? "",
          s ? (s.display ?? readableValue(s.value)) : "",
          s?.file ?? "",
          s?.page ?? "",
          s?.quote ?? "",
          s?.package_path ?? "",
          requiredAction(f),
          f.answer?.selection ?? "None recorded",
          f.answer
            ? f.answer.state === "current"
              ? "Answer recorded (current); documents not changed"
              : "Not current: earlier evidence"
            : "",
          f.reason ?? "",
          who(f.responsible),
        ]),
      ),
  );
  add(
    "Source record",
    [
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
      "Support kind",
    ],
    [...content.source_record]
      .sort(
        (a, b) =>
          a.package_path.localeCompare(b.package_path) ||
          a.page - b.page ||
          a.attribute.localeCompare(b.attribute) ||
          a.value.localeCompare(b.value),
      )
      .map((f) => [
        f.subject,
        f.attribute,
        sourceValue(f.attribute, f.value),
        f.period,
        f.original_filename,
        f.package_path,
        f.page,
        f.quote,
        f.method,
        f.confidence,
        statusLabel(f.review_status),
        f.reviewer_name ?? (f.reviewer ? "Operator" : ""),
        dateTimeLabel(f.reviewed_at),
        f.file_hash,
        f.record_version ?? "",
        f.support_kind ?? "",
      ]),
    [
      "Technical record: every value read from the documents, with where it was read and who reviewed it. Identifiers show only their last four digits. File hash is the SHA-256 of the original file.",
    ],
  );
  const initial = content.previous_version == null;
  add(
    "Change log",
    ["At", "Action", "Detail"],
    [
      ...(initial ? [] : diffRows(diff, true).map(([label, detail]) => ["", label, detail])),
      ...content.change_log.map((e) => [
        dateTimeLabel(e.at),
        e.label ?? actionLabel(e.action),
        e.detail,
      ]),
    ],
    [
      initial
        ? `${INITIAL} The rows above are the file’s recorded history up to this version.`
        : `Summary rows compare this version with version ${content.previous_version}; the dated rows are what happened since.`,
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
      "Kind",
    ],
    (content.segment_locations ?? []).map((r, n) => [
      n + 1,
      documentName(r.type),
      r.subject,
      r.original_filename,
      r.page_start,
      r.page_end,
      r.package_path,
      r.page_start,
      r.page_end,
      {
        supporting: "Additional supporting document",
        not_required: "Not required",
        unfiled: "Unfiled",
        history: "History",
        filed: "Checklist document",
      }[kindOfPath(r.package_path)],
    ]),
  );
  add(
    "Status summary",
    ["Section", "Item", "Subject", "Responsible", "Status / detail"],
    [
      ["Policy", "", "", "", content.preparation?.policy ?? "Preparation boundary not recorded"],
      [
        "Version",
        content.number,
        "",
        "",
        `${dateTimeLabel(content.created_at)}${initial ? " · Initial version" : ` · Compared with version ${content.previous_version}`}`,
      ],
      ["Preparation", "", "", "", content.preparation?.label ?? "Status not assessed"],
      ["Satisfied", "", "", "", content.preparation?.satisfied ?? content.readiness.satisfied],
      ["Waived", "", "", "", content.preparation?.waived ?? "not recorded"],
      ["Not applicable", "", "", "", content.preparation?.notApplicable ?? "not recorded"],
      ...(content.preparation?.groups ?? []).map((g) => {
        const row = groupRow(g, byKey);
        return [
          "Unresolved preparation",
          row.title,
          [g.subject, g.period].filter(Boolean).join(" · "),
          "",
          [row.status, ...row.reasons].filter(Boolean).join(" — "),
        ];
      }),
      ...(content.preparation?.later ?? []).map((r) => [
        "Later lender work",
        r.title,
        r.subject,
        who(r.responsible),
        [r.tracking_label ?? laterWorkStatus(r.status, r.tracking), r.detail]
          .filter(Boolean)
          .join(" — "),
      ]),
    ],
  );
  const answered = content.findings.filter((f) => f.answer);
  add(
    "Recorded answers",
    [
      "Question",
      "Applies to",
      "Answer status",
      "Recorded selection",
      "Explanation",
      "Recorded by",
      "Recorded at",
      "Supporting sources",
      "Corrections still needed",
      "Supporting documents corrected",
      "Disagreement status",
      "Required action",
      "Summary",
    ],
    answered.map((f) => {
      const a = f.answer!;
      return [
        a.question,
        f.party,
        a.state === "current" ? "Current" : "Not current: earlier evidence",
        a.selection,
        a.explanation,
        a.recorded_by,
        dateTimeLabel(a.recorded_at),
        a.supporting.map(sourceText).join("\n"),
        a.corrections_needed.map(sourceText).join("\n"),
        a.documents_corrected ? "Yes" : a.corrections_needed.length ? "No" : "Not needed",
        statusLabel(f.status),
        requiredAction(f),
        a.summary,
      ];
    }),
    [ANSWER_MEANING],
  );
  add(
    "Evidence consulted",
    ["Finding", "Rule", "Kind", "Original file", "Page", "Quote", "Package path", "Detail"],
    content.findings
      .filter((f) => f.type === "conflict" || f.answer)
      .flatMap((f) =>
        (f.evidence_consulted ?? []).map((e) => [
          f.problem_title ?? f.title ?? f.rule_id,
          f.rule_id,
          e.kind,
          e.file,
          e.page ?? "",
          e.quote,
          e.package_path,
          e.detail,
        ]),
      ),
    [
      "What each disagreement's check also read, beyond the compared values: document signature details and the rule settings applied. For audit; the Conflicts sheet shows the comparison.",
    ],
  );
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  return polishWorkbook(bytes, shapes);
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
  // JSZip creates parent directories with the wall clock, even when files have fixed dates.
  // Normalize those entries too so historical downloads retain identical bytes.
  zip.forEach((_path, entry) => {
    entry.date = FIXED_DATE;
  });
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
