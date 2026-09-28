// Inspects a downloaded lender-file ZIP and writes readable evidence beside it:
//   zip-listing.txt            every path in the ZIP, sorted
//   00_Package_Report.html     the report exactly as packaged
//   workbook-inspection.md     the workbook rows needed to check the video's claims
// It throws if the package does not belong to the expected deal and version, or does not
// show the recorded answer, its reason, the open disagreement and the outstanding work.
// Standalone, to re-check a recorded take: node inspect-package.mjs work/<take>
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const RAW_CODES =
  /needs_review|received_with_issues|later_lender|not_applicable|party_id|portal_answer/g;

export async function inspectPackage(zipPath, outDir, expect) {
  const bytes = fs.readFileSync(zipPath);
  const problems = [];
  const check = (ok, msg) => (ok ? null : problems.push(msg));
  if (bytes.subarray(0, 4).toString("binary") !== "PK\x03\x04")
    throw Error(`${zipPath} is not a ZIP file.`);
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files).sort();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "zip-listing.txt"), paths.join("\n") + "\n");

  const report = zip.file("00_Package_Report.html");
  const workbook = zip.file("00_Package_Workbook.xlsx");
  if (!report || !workbook) throw Error("The package has no report or workbook.");
  const html = await report.async("string");
  fs.writeFileSync(path.join(outDir, "00_Package_Report.html"), html);
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const book = XLSX.read(await workbook.async("nodebuffer"));
  const rows = (name) =>
    book.Sheets[name] ? XLSX.utils.sheet_to_json(book.Sheets[name], { defval: "" }) : [];

  // Identity
  const identity = `${expect.dealCode} · ${expect.dealName} · Version ${expect.version}`;
  check(text.includes(identity), `Report heading is not "${identity}".`);
  const versionRow = XLSX.utils
    .sheet_to_json(book.Sheets["Status summary"] ?? {}, { header: 1 })
    .find((r) => r[0] === "Version");
  check(
    versionRow && Number(versionRow[1]) === expect.version,
    `Workbook Status summary version is ${versionRow?.[1]}, expected ${expect.version}.`,
  );

  // Recorded answer and the still-open disagreement
  const answers = rows("Recorded answers").filter((r) => r.Question && r["Answer status"]);
  const answer = answers.find((r) => /purchase price/i.test(r.Question));
  check(answer, 'Workbook has no "Recorded answers" row for the purchase price.');
  if (answer && expect.answer) {
    check(
      answer["Recorded selection"] === expect.answer.choice,
      `Recorded selection is ${answer["Recorded selection"]}.`,
    );
    check(
      answer.Explanation === expect.answer.note,
      "Recorded explanation differs from the reason typed on screen.",
    );
    check(answer["Answer status"] === "Current", `Answer status is ${answer["Answer status"]}.`);
    check(
      answer["Disagreement status"] === "Open",
      "The disagreement is not open in the workbook.",
    );
    check(
      answer["Supporting documents corrected"] === "No",
      "The workbook says the documents were corrected.",
    );
    check(
      /Letter of intent/.test(answer["Corrections still needed"]),
      "No corrections still needed are listed.",
    );
    check(text.includes(expect.answer.note), "The report does not show the reason.");
  }
  const conflicts = rows("Conflicts").filter((r) => /purchase price/i.test(r["Issue title"]));
  check(
    conflicts.length >= 2 && conflicts.every((r) => r.Status === "Open"),
    "Conflicts rows are missing or not open.",
  );
  check(/Questions and recorded answers/.test(text), "Report has no recorded-answers section.");
  check(/Unresolved preparation work/.test(text), "Report has no unresolved-work section.");
  const missing = rows("Missing items");
  check(
    missing.some(
      (r) =>
        r["Applies to"] === "Kiel McDermott" &&
        String(r.Period) === "2025" &&
        r.Status === "Missing",
    ),
    "Kiel McDermott's 2025 return is not listed as missing.",
  );

  // Filing of documents outside the checklist and readable values
  const outside = paths.filter(
    (p) => p.startsWith("Z_Unfiled_or_Not_Required/") && !p.endsWith("/"),
  );
  check(
    !outside.some((p) => /\/UNFILED_.*_unassigned/.test(p) && /BANK_STATEMENT|CITIZENSHIP/.test(p)),
    "A known supporting document lost its filing.",
  );
  check(
    outside.some((p) => /SUPPORTING_BANK_STATEMENT_Jaylan-Heller_2026-0\d_/.test(p)),
    "Jaylan Heller's bank statements are not filed as supporting documents.",
  );
  const rawCodes = html.match(RAW_CODES) ?? [];
  check(
    rawCodes.length === 0,
    `Report contains raw status codes: ${[...new Set(rawCodes)].join(", ")}`,
  );

  // Readable summary
  const md = [];
  const table = (list, cols) => {
    if (!list.length) return "_none_\n";
    const cell = (v) =>
      String(v ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, "<br>");
    return (
      [
        `| ${cols.join(" | ")} |`,
        `| ${cols.map(() => "---").join(" | ")} |`,
        ...list.map((r) => `| ${cols.map((c) => cell(r[c])).join(" | ")} |`),
      ].join("\n") + "\n"
    );
  };
  md.push(`# Lender package inspection: ${expect.dealCode}, version ${expect.version}\n`);
  md.push(
    `- ZIP: \`${path.basename(zipPath)}\` (${bytes.length} bytes, SHA-256 \`${createHash("sha256").update(bytes).digest("hex")}\`)`,
  );
  md.push(`- Report heading: ${text.includes(identity) ? `"${identity}"` : "(not found)"}`);
  md.push(`- Workbook sheets: ${book.SheetNames.join(", ")}`);
  md.push(`- Paths in ZIP: ${paths.length} (see zip-listing.txt)\n`);
  md.push('## Recorded answers (sheet "Recorded answers")\n');
  md.push(
    table(answers, [
      "Question",
      "Answer status",
      "Recorded selection",
      "Explanation",
      "Recorded by",
      "Recorded at",
      "Supporting sources",
      "Corrections still needed",
      "Supporting documents corrected",
      "Disagreement status",
    ]),
  );
  md.push('## Purchase-price disagreement (sheet "Conflicts")\n');
  md.push(
    table(conflicts, [
      "Rule",
      "Status",
      "Value",
      "File",
      "Page",
      "Quote",
      "Package path",
      "Recorded answer",
      "Answer status",
    ]),
  );
  md.push('## Missing and incomplete items (sheet "Missing items")\n');
  md.push(
    table(missing, ["Item", "Title", "Responsible", "Applies to", "Period", "Status", "Why"]),
  );
  md.push('## Documents outside the checklist (from "Segment locations")\n');
  const segs = rows("Segment locations").filter((r) => String(r["Package path"]).startsWith("Z_"));
  md.push(table(segs, ["Type", "Subject", "Original filename", "Package path", "Kind"]));
  md.push('## Index: filing of every checklist document (sheet "Index")\n');
  md.push(
    table(rows("Index"), ["Item", "Title", "Applies to", "Period", "Status", "Package path"]),
  );
  md.push("## Checks\n");
  md.push(
    problems.length
      ? problems.map((p) => `- FAILED: ${p}`).join("\n")
      : "- All package checks passed.",
  );
  fs.writeFileSync(path.join(outDir, "workbook-inspection.md"), md.join("\n") + "\n");

  if (problems.length) throw Error(`Package checks failed:\n- ${problems.join("\n- ")}`);
  return { paths: paths.length, answer, identity };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw Error("Usage: inspect-package.mjs work/<take>");
  const take = JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8"));
  const out = path.join(dir, "evidence", "inspect-again");
  const r = await inspectPackage(path.join(dir, "evidence", take.package.zip), out, {
    dealCode: take.dealCode,
    dealName: take.dealName,
    version: take.package.version,
    answer: take.answer,
  });
  console.log(`${r.identity}: ${r.paths} paths; checks passed. Output in ${out}`);
}
