/**
 * A synthetic page as an ordered list of drawing operations. Text is emitted strictly in reading
 * order, one row at a time, because PDF text extraction follows drawing order: a row's items join
 * into one line, and a change of baseline starts the next. Every template relies on that to keep a
 * stated value next to its label and to keep index lines (Name:, Period:) on lines of their own.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type RGB = readonly [number, number, number];
export type Face = "sans" | "sansB" | "sansI" | "serif" | "serifB" | "serifI" | "mono" | "monoB";
export type Align = "left" | "right" | "center";
export type Op =
  | {
      k: "text";
      s: string;
      x: number;
      y: number;
      size: number;
      face: Face;
      color: RGB;
      rotate?: number;
      opacity?: number;
    }
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: RGB; stroke?: RGB; lw?: number }
  | {
      k: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: RGB;
      lw: number;
      dash?: number[];
    }
  | { k: "ellipse"; x: number; y: number; rx: number; ry: number; stroke: RGB; lw: number };

export const INK: RGB = [0.1, 0.11, 0.13];
export const MUTED: RGB = [0.38, 0.4, 0.44];
export const RULE: RGB = [0.72, 0.74, 0.77];
export const WHITE: RGB = [1, 1, 1];
export const SYNTHETIC_RED: RGB = [0.72, 0.05, 0.05];

const STANDARD: Record<Face, StandardFonts> = {
  sans: StandardFonts.Helvetica,
  sansB: StandardFonts.HelveticaBold,
  sansI: StandardFonts.HelveticaOblique,
  serif: StandardFonts.TimesRoman,
  serifB: StandardFonts.TimesRomanBold,
  serifI: StandardFonts.TimesRomanItalic,
  mono: StandardFonts.Courier,
  monoB: StandardFonts.CourierBold,
};
export type Fonts = Record<Face, PDFFont>;
export async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  const entries = await Promise.all(
    Object.entries(STANDARD).map(async ([face, name]) => [face, await pdf.embedFont(name)]),
  );
  return Object.fromEntries(entries) as Fonts;
}
let metrics: Promise<Fonts> | null = null;
/** Width measurement uses the same standard-font metrics every backend draws with. */
export const loadMetrics = () => (metrics ??= PDFDocument.create().then((pdf) => embedFonts(pdf)));

export type TextStyle = { size?: number; face?: Face; color?: RGB; align?: Align };
export class Sheet {
  readonly ops: Op[] = [];
  constructor(
    readonly fonts: Fonts,
    readonly W = 612,
    readonly H = 792,
  ) {}
  width(s: string, size = 9, face: Face = "sans") {
    return this.fonts[face].widthOfTextAtSize(s, size);
  }
  /** One run of text. Runs sharing a baseline and emitted consecutively extract as one line. */
  text(s: string, x: number, y: number, o: TextStyle = {}) {
    if (!s) return 0;
    const size = o.size ?? 9,
      face = o.face ?? "sans",
      w = this.width(s, size, face);
    const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push({ k: "text", s, x: x0, y, size, face, color: o.color ?? INK });
    return w;
  }
  rotated(s: string, x: number, y: number, deg: number, size: number, color: RGB, opacity = 1) {
    this.ops.push({ k: "text", s, x, y, size, face: "sansB", color, rotate: deg, opacity });
  }
  /** Break at spaces only, so a wrapped sentence still extracts as the same words in order. */
  wrap(s: string, width: number, size = 9, face: Face = "sans") {
    const lines: string[] = [];
    let line = "";
    for (const word of s.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.width(next, size, face) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  /** A wrapped paragraph; returns the baseline below its last line. */
  para(
    s: string,
    x: number,
    y: number,
    width: number,
    o: TextStyle & { leading?: number; indent?: number } = {},
  ) {
    const size = o.size ?? 9,
      face = o.face ?? "sans",
      leading = o.leading ?? size * 1.32;
    const lines = this.wrap(s, width - (o.indent ?? 0), size, face);
    lines.forEach((line, i) =>
      this.text(line, x + (i === 0 ? (o.indent ?? 0) : 0), y - i * leading, { ...o, size, face }),
    );
    return y - lines.length * leading;
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; lw?: number }) {
    this.ops.push({ k: "rect", x, y, w, h, ...o });
  }
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: RGB = RULE,
    lw = 0.6,
    dash?: number[],
  ) {
    this.ops.push({ k: "line", x1, y1, x2, y2, color, lw, ...(dash ? { dash } : {}) });
  }
  ellipse(x: number, y: number, rx: number, ry: number, stroke: RGB, lw = 1) {
    this.ops.push({ k: "ellipse", x, y, rx, ry, stroke, lw });
  }
  /** Every drawn string in order, as a reader of the extracted text would see it. */
  strings() {
    return this.ops.flatMap((o) => (o.k === "text" ? [o.s] : []));
  }
}

const c = (v: RGB) => rgb(v[0], v[1], v[2]);
/** pdf-lib backend: appends to the page, after any content it already carries. */
export function drawPdfLib(page: PDFPage, fonts: Fonts, ops: Op[]) {
  for (const o of ops) {
    if (o.k === "text")
      page.drawText(o.s, {
        x: o.x,
        y: o.y,
        size: o.size,
        font: fonts[o.face],
        color: c(o.color),
        ...(o.rotate ? { rotate: degrees(o.rotate) } : {}),
        ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
      });
    else if (o.k === "rect")
      page.drawRectangle({
        x: o.x,
        y: o.y,
        width: o.w,
        height: o.h,
        ...(o.fill ? { color: c(o.fill) } : {}),
        ...(o.stroke ? { borderColor: c(o.stroke), borderWidth: o.lw ?? 0.6 } : {}),
      });
    else if (o.k === "line")
      page.drawLine({
        start: { x: o.x1, y: o.y1 },
        end: { x: o.x2, y: o.y2 },
        thickness: o.lw,
        color: c(o.color),
        ...(o.dash ? { dashArray: o.dash } : {}),
      });
    else
      page.drawEllipse({
        x: o.x,
        y: o.y,
        xScale: o.rx,
        yScale: o.ry,
        borderColor: c(o.stroke),
        borderWidth: o.lw,
      });
  }
}

const PDFKIT_FONT: Record<Face, string> = {
  sans: "Helvetica",
  sansB: "Helvetica-Bold",
  sansI: "Helvetica-Oblique",
  serif: "Times-Roman",
  serifB: "Times-Bold",
  serifI: "Times-Italic",
  mono: "Courier",
  monoB: "Courier-Bold",
};
type PdfKit = PDFKit.PDFDocument;
/** PDFKit backend, for the encrypted fixture pdf-lib cannot write. Origin is top-left there. */
export function drawPdfKit(doc: PdfKit, ops: Op[], H = 792) {
  for (const o of ops) {
    if (o.k === "text") {
      doc.save();
      if (o.opacity !== undefined) doc.opacity(o.opacity);
      if (o.rotate) doc.rotate(-o.rotate, { origin: [o.x, H - o.y] });
      doc
        .font(PDFKIT_FONT[o.face])
        .fontSize(o.size)
        .fillColor([o.color[0] * 255, o.color[1] * 255, o.color[2] * 255])
        .text(o.s, o.x, H - o.y, { lineBreak: false, baseline: "alphabetic" });
      doc.restore();
    } else if (o.k === "rect") {
      doc.rect(o.x, H - o.y - o.h, o.w, o.h);
      const fill = o.fill ? ([o.fill[0] * 255, o.fill[1] * 255, o.fill[2] * 255] as const) : null;
      const stroke = o.stroke
        ? ([o.stroke[0] * 255, o.stroke[1] * 255, o.stroke[2] * 255] as const)
        : null;
      doc.lineWidth(o.lw ?? 0.6);
      if (fill && stroke) doc.fillAndStroke([...fill], [...stroke]);
      else if (fill) doc.fill([...fill]);
      else if (stroke) doc.stroke([...stroke]);
    } else if (o.k === "line") {
      doc.save().lineWidth(o.lw);
      if (o.dash) doc.dash(o.dash[0]!, { space: o.dash[1] ?? o.dash[0]! });
      doc
        .moveTo(o.x1, H - o.y1)
        .lineTo(o.x2, H - o.y2)
        .stroke([o.color[0] * 255, o.color[1] * 255, o.color[2] * 255]);
      doc.restore();
    } else
      doc
        .lineWidth(o.lw)
        .ellipse(o.x, H - o.y, o.rx, o.ry)
        .stroke([o.stroke[0] * 255, o.stroke[1] * 255, o.stroke[2] * 255]);
  }
}
