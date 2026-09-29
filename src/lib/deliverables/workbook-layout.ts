import * as XLSX from "xlsx";

/** One table sheet as written: a header row, then data rows; notes and the footer follow. */
export type SheetShape = { name: string; headers: string[]; rows: unknown[][] };

const MIN = 10;
const MAX = 60;
/** Column characters one A3 landscape page holds legibly (about 65% scale at the widest). */
const PAGE_WIDTH = 280;

/** Readable column widths from the longest line in each column, capped so long text wraps. */
export function columnWidths(headers: string[], rows: unknown[][]) {
  return headers.map((h, i) => {
    const longest = rows.reduce<number>((m, r) => {
      const lines = String(r[i] ?? "").split("\n");
      return Math.max(m, ...lines.map((l) => l.length));
    }, 0);
    return Math.min(MAX, Math.max(MIN, h.length + 2, Math.min(longest + 2, MAX)));
  });
}

const column = (n: number) => {
  let s = "";
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Filters, widths and margins SheetJS writes itself; set before the book is written. */
export function layoutSheet(sheet: XLSX.WorkSheet, headers: string[], rows: unknown[][]) {
  sheet["!cols"] = columnWidths(headers, rows).map((wch) => ({ wch }));
  if (rows.length)
    sheet["!autofilter"] = { ref: `A1:${column(headers.length - 1)}${rows.length + 1}` };
  sheet["!margins"] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
}

type Cfb = {
  FullPaths: string[];
  FileIndex: { content: Uint8Array | number[] }[];
};
const CFB = (
  XLSX as unknown as {
    CFB: {
      read: (b: Buffer, o: { type: "buffer" }) => Cfb;
      write: (c: Cfb, o: { fileType: "zip"; type: "buffer"; compression: boolean }) => Uint8Array;
    };
  }
).CFB;

const replaceOnce = (xml: string, find: string | RegExp, by: string, part: string) => {
  const next = xml.replace(find, by);
  if (next === xml) throw Error(`Workbook layout: ${part} did not have the expected shape`);
  return next;
};

/**
 * What the community edition of SheetJS does not write: a bold, shaded header style; wrapped,
 * top-aligned body cells; a frozen header row; landscape A3 page setup, scaled to the fewest
 * pages across that keep text legible (whole sheet width on one to a few pages, never cut at
 * 100% into many); and the header row repeated on every printed page.
 * Deterministic: the same book gives the same bytes. Fails loudly if SheetJS changes its output.
 */
export function polishWorkbook(bytes: Buffer, shapes: SheetShape[]): Buffer {
  const zip = CFB.read(bytes, { type: "buffer" });
  const part = (path: string) => {
    const i = zip.FullPaths.findIndex((p) => p.endsWith(`/${path}`));
    if (i < 0) throw Error(`Workbook layout: ${path} missing`);
    const entry = zip.FileIndex[i]!;
    return {
      get: () => Buffer.from(entry.content as Uint8Array).toString("utf8"),
      set: (xml: string) => {
        entry.content = Buffer.from(xml, "utf8");
      },
    };
  };

  const styles = part("xl/styles.xml");
  let css = styles.get();
  css = replaceOnce(
    css,
    /<fonts count="1">(<font>[\s\S]*?<\/font>)<\/fonts>/,
    `<fonts count="2">$1<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>`,
    "styles fonts",
  );
  css = replaceOnce(
    css,
    /<fills count="2">([\s\S]*?)<\/fills>/,
    `<fills count="3">$1<fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF2"/><bgColor indexed="64"/></patternFill></fill></fills>`,
    "styles fills",
  );
  css = replaceOnce(
    css,
    /<borders count="1">([\s\S]*?)<\/borders>/,
    `<borders count="2">$1<border><left/><right/><top/><bottom style="thin"><color rgb="FF8A99A8"/></bottom><diagonal/></border></borders>`,
    "styles borders",
  );
  css = replaceOnce(
    css,
    /<cellXfs count="1">([\s\S]*?)<\/cellXfs>/,
    `<cellXfs count="3">$1<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>`,
    "styles cell formats",
  );
  styles.set(css);

  const titles: string[] = [];
  shapes.forEach((shape, i) => {
    const sheet = part(`xl/worksheets/sheet${i + 1}.xml`);
    let xml = sheet.get();
    const last = shape.rows.length + 1;
    // Header row: style 1; data rows: style 2; notes and footer keep the default.
    xml = xml.replace(/<c r="([A-Z]+)(\d+)"/g, (m, col: string, row: string) => {
      const r = Number(row);
      return r === 1 ? `<c r="${col}${row}" s="1"` : r <= last ? `<c r="${col}${row}" s="2"` : m;
    });
    xml = replaceOnce(
      xml,
      `<sheetView workbookViewId="0"/>`,
      `<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`,
      `${shape.name} view`,
    );
    const width = columnWidths(shape.headers, shape.rows).reduce((a, b) => a + b, 0);
    const across = Math.max(1, Math.ceil(width / PAGE_WIDTH));
    xml = replaceOnce(
      xml,
      /(<worksheet [^>]*>)/,
      `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`,
      `${shape.name} properties`,
    );
    xml = replaceOnce(
      xml,
      /(<pageMargins [^>]*\/>)/,
      `$1<pageSetup paperSize="8" orientation="landscape" fitToWidth="${across}" fitToHeight="0"/>`,
      `${shape.name} page setup`,
    );
    sheet.set(xml);
    titles.push(
      `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${shape.name}'!$1:$1</definedName>`,
    );
  });

  const workbook = part("xl/workbook.xml");
  let wb = workbook.get();
  wb = wb.includes("</definedNames>")
    ? wb.replace("</definedNames>", `${titles.join("")}</definedNames>`)
    : replaceOnce(
        wb,
        "</sheets>",
        `</sheets><definedNames>${titles.join("")}</definedNames>`,
        "workbook names",
      );
  workbook.set(wb);

  return Buffer.from(CFB.write(zip, { fileType: "zip", type: "buffer", compression: true }));
}
