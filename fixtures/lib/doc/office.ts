/**
 * Word and Excel fixtures. The business plan follows the SBA traditional plan outline; the
 * year-end workbook is an accountant's two-sheet file with numeric cells. Each stated value is
 * its own cell, which is how the intake reads a spreadsheet.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { Doc, Plan } from "../../plans/shared";
import { longDate, money } from "./format";
import { buyerName, context, industry, lenderName, targetName } from "./kit";
import { cue, metaLines, signatureLine } from "./quotes";
import { Sheet, loadMetrics } from "./sheet";
import { financialLines } from "./statements";

const FIXED = new Date("2026-09-15T12:00:00.000Z");

export async function businessPlanDocx(p: Plan, docs: Doc[]) {
  const fonts = await loadMetrics();
  const sections = [];
  for (const d of docs) {
    const c = context(new Sheet(fonts), p, d);
    const buyer = buyerName(c),
      target = targetName(c);
    const kind = industry(target);
    const trade =
      kind === "hvac"
        ? "heating and air-conditioning service"
        : kind === "grounds"
          ? "commercial grounds maintenance"
          : kind === "fitness"
            ? "boutique fitness"
            : "service";
    const revenue = p.model.years["2025"]?.revenue ?? 1_400_000;
    const P = (
      text: string,
      o: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
    ) =>
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: o.bold,
            italics: o.italic,
            size: o.size ?? 22,
            color: o.color,
          }),
        ],
        spacing: { after: 120 },
      });
    const H = (text: string) =>
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      });
    const cell = (text: string, bold = false, right = false) =>
      new TableCell({
        children: [
          new Paragraph({
            alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text, bold, size: 20 })],
          }),
        ],
        width: { size: right ? 30 : 70, type: WidthType.PERCENTAGE },
      });
    const uses: [string, number][] = [
      ["Purchase of the business", p.model.price],
      ["Working capital and closing costs", 100_000],
    ];
    sections.push({
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      headers: {
        default: new Header({
          children: [P(`${buyer} · Confidential`, { size: 16, color: "666666" })],
        }),
      },
      footers: {
        default: new Footer({
          children: [P("SYNTHETIC SPECIMEN — synthetic test data", { size: 16, color: "B00000" })],
        }),
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: cue(d), bold: true, size: 44 })],
          spacing: { after: 120 },
        }),
        P(`${buyer} — acquisition of the ${trade} business of ${target}`, { size: 26 }),
        P(`Prepared ${longDate(d.metadata.document_date ?? "2026-08-31")} for ${lenderName(c)}`, {
          italic: true,
          color: "555555",
        }),
        ...metaLines(p, d).map((line) => P(line, { size: 18, color: "555555" })),
        H("1. Executive Summary"),
        P(
          `${buyer} will acquire the ${trade} business of ${target}, an established company with ${money(revenue)} in revenue last year and a base of recurring customers. The purchase is financed with an SBA 7(a) loan, the buyer’s cash injection and, where applicable, a note from the seller on full standby.`,
        ),
        H("2. Company Description"),
        P(
          `${target} has served the Tazmervale area for more than a decade from its location at 14 Velnoric Way. After closing, the business keeps its name, staff, phone number and customer agreements, with the buyer as owner and general manager.`,
        ),
        H("3. Market Analysis"),
        P(
          "Demand in the service area is steady and driven by replacement and maintenance rather than new construction. The three nearest competitors are owner-operated and do not offer maintenance agreements, which is the business’s main advantage.",
        ),
        H("4. Organization and Management"),
        P(
          `${buyer} is owned by the individuals listed in its ownership chart. The buyer has fifteen years of experience in the trade and seven years managing daily operations. The seller will provide a transition period under a consulting agreement.`,
        ),
        H("5. Service Line"),
        P(
          "Maintenance agreements, repair calls and equipment replacement, priced from a published rate card and reviewed annually.",
        ),
        H("6. Marketing and Sales"),
        P(
          "Retain existing agreement customers through a welcome letter and priority scheduling, grow referrals from property managers, and add a seasonal promotion each spring and fall.",
        ),
        H("7. Funding Request"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
          } as never,
          rows: [
            new TableRow({ children: [cell("Use of funds", true), cell("Amount", true, true)] }),
            ...uses.map(
              ([label, amount]) =>
                new TableRow({ children: [cell(label), cell(money(amount), false, true)] }),
            ),
            new TableRow({
              children: [
                cell("Total project cost", true),
                cell(money(p.model.project), true, true),
              ],
            }),
          ],
        }),
        H("8. Financial Projections"),
        P(
          `Revenue is projected to grow 4% a year from ${money(revenue)}, with gross margin held at 55% and debt service coverage above 1.5x in each of the first three years. Detailed projections are attached.`,
        ),
        ...d.notes.map((note) => P(note, { italic: true })),
        P(signatureLine(d), { size: 18, color: "555555" }),
        P("SYNTHETIC SPECIMEN — synthetic test data; not a real business plan", {
          size: 18,
          color: "B00000",
        }),
      ],
    });
  }
  const document = new Document({
    creator: "AcqFile synthetic fixtures",
    title: cue(docs[0]!),
    description: "Synthetic business plan",
    sections,
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
  const core = zip.file("docProps/core.xml");
  if (core)
    zip.file(
      "docProps/core.xml",
      (await core.async("string")).replace(
        /(<dcterms:(?:created|modified)[^>]*>)[^<]+/g,
        `$1${FIXED.toISOString()}`,
      ),
    );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Cells each workbook sheet must contain, in the order the intake reads them. */
export function workbookCells(
  p: Plan,
  d: Doc,
  sheet: "Income Statement" | "Balance Sheet",
): (string | number)[][] {
  const c = context(new Sheet(null as never), p, d);
  const lines = financialLines(c);
  const year = d.period ?? "2025";
  const company = c.name;
  const rows = (items: typeof lines.income) =>
    items.map((l) =>
      l.caption
        ? [l.label]
        : [
            `${l.indent ? "    " : ""}${l.label}`,
            l.fact && d.facts[l.fact] !== undefined ? Number(d.facts[l.fact]) : l.amount,
          ],
    );
  if (sheet === "Income Statement")
    return [
      [cue(d)],
      [company],
      [`Statement of Income — for the year ended December 31, ${year}`],
      ...metaLines(p, d).map((line) => [line]),
      ["Compiled by Vale & Reed CPAs LLP. See accountant’s compilation report. Unaudited."],
      [],
      ["", `FY${year}`],
      ...rows(lines.income),
      [],
      [signatureLine(d)],
      ["SYNTHETIC SPECIMEN — synthetic test data"],
    ];
  return [
    [company],
    [`Balance Sheet — December 31, ${year}`],
    [],
    ["", `12/31/${year}`],
    ...rows(lines.balance),
    [],
    ["SYNTHETIC SPECIMEN — synthetic test data"],
  ];
}
export async function financialWorkbook(p: Plan, docs: Doc[]) {
  const book = XLSX.utils.book_new();
  book.Props = {
    Title: cue(docs[0]!),
    Author: "Vale & Reed CPAs LLP",
    CreatedDate: FIXED,
    ModifiedDate: FIXED,
  };
  for (const name of ["Income Statement", "Balance Sheet"] as const) {
    const cells = docs.flatMap((d) => workbookCells(p, d, name));
    const sheet = XLSX.utils.aoa_to_sheet(cells);
    for (const [ref, cell] of Object.entries(sheet))
      if (!ref.startsWith("!") && typeof (cell as XLSX.CellObject).v === "number")
        (cell as XLSX.CellObject).z = "#,##0";
    sheet["!cols"] = [{ wch: 46 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
