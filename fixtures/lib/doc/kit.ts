/**
 * Shared page furniture for the synthetic documents: letterheads, key/value rows, tables, the
 * e-signature record strip and the synthetic marking. Everything draws in reading order.
 */
import type { Doc, Plan } from "../../plans/shared";
import { seeded } from "./format";
import { metaLines, partyName, stated, statedText, signatureLine, type Stated } from "./quotes";
import {
  INK,
  MUTED,
  RULE,
  SYNTHETIC_RED,
  WHITE,
  type Align,
  type Face,
  type RGB,
  Sheet,
} from "./sheet";

export const M = 54; // side margin
export const R = 612 - 54; // right edge
export const TOP = 748; // first baseline below the synthetic marking

export type Ctx = {
  s: Sheet;
  p: Plan;
  d: Doc;
  rng: () => number;
  name: string;
  party: (id: string) => string | undefined;
  has: (attribute: string) => boolean;
  v: <T = unknown>(attribute: string) => T;
  stated: (attribute: string) => Stated;
  sentence: (attribute: string) => string;
};
export function context(s: Sheet, p: Plan, d: Doc): Ctx {
  return {
    s,
    p,
    d,
    rng: seeded(`${p.id}:${d.id}:${d.type}`),
    name: partyName(p, d),
    party: (id) => p.parties.find((x) => x.id === id)?.legal_name,
    has: (a) => d.facts[a] !== undefined,
    v: <T>(a: string) => d.facts[a] as T,
    stated: (a) => stated(d, a, d.facts[a]),
    sentence: (a) => statedText(stated(d, a, d.facts[a])),
  };
}

export const buyerName = (c: Ctx) => c.party("buyer") ?? "Varnholt Acquisition LLC";
export const targetName = (c: Ctx) => c.party("target") ?? "Varnholt Climate Services LLC";
export const lenderName = (c: Ctx) => String(c.p.profile.target_lender ?? "Zelmivar Bank");
export const landlordName = (c: Ctx) =>
  c.p.parties.find((x) => x.roles.includes("landlord" as never))?.legal_name ??
  "Zelmivar Premises LLC";
export const TARGET_ADDRESS = "14 Velnoric Way, Tazmervale, ZZ 00000";
export const BUYER_ADDRESS = "220 Orlanne Street, Suite 400, Tazmervale, ZZ 00000";
export const personAddress = (c: Ctx, id = c.d.party) =>
  `${120 + Math.floor(seeded(id)() * 860)} Calder Ridge Road, Tazmervale, ZZ 00000`;
export const industry = (name: string) =>
  /climate|hvac|air/i.test(name)
    ? "hvac"
    : /ground|lawn|landscap/i.test(name)
      ? "grounds"
      : /fitness|gym/i.test(name)
        ? "fitness"
        : "general";

/** A labelled value on one line: label run, then value run, nothing between them. */
export function kv(
  c: Ctx,
  label: string,
  value: string,
  x: number,
  y: number,
  o: {
    w?: number;
    size?: number;
    labelFace?: Face;
    face?: Face;
    color?: RGB;
    align?: Align;
    right?: number;
  } = {},
) {
  const size = o.size ?? 9;
  c.s.text(label, x, y, { size, face: o.labelFace ?? "sans", color: o.color ?? MUTED });
  if (o.align === "right")
    c.s.text(value, o.right ?? R, y, { size, face: o.face ?? "sans", align: "right" });
  else c.s.text(value, x + (o.w ?? 120), y, { size, face: o.face ?? "sans" });
}
/** A fact stated as label and value, drawn exactly as the truth quote reads. */
export function factKv(
  c: Ctx,
  attribute: string,
  x: number,
  y: number,
  o: Parameters<typeof kv>[5] = {},
) {
  const st = c.stated(attribute);
  if (!("label" in st)) throw Error(`${c.d.type}/${attribute} is not a label/value fact`);
  kv(c, st.label, st.value, x, y, o);
}

export type Col = { w: number; head?: string; align?: Align };
/**
 * A table drawn row by row, cells left to right, so each row extracts as one line in column order.
 * Empty cells draw nothing, which keeps a label next to the next value that follows it.
 */
export function table(
  c: Ctx,
  x: number,
  y: number,
  cols: Col[],
  rows: (string | null | undefined)[][],
  o: {
    size?: number;
    lead?: number;
    head?: boolean;
    headFill?: RGB;
    headColor?: RGB;
    zebra?: RGB;
    bold?: Set<number>;
    rules?: boolean;
    face?: Face;
  } = {},
) {
  const size = o.size ?? 8.5,
    lead = o.lead ?? size + 5.5;
  const width = cols.reduce((n, col) => n + col.w, 0);
  const cell = (text: string, col: Col, cx: number, cy: number, face: Face, color?: RGB) => {
    if (!text) return;
    const pad = 4;
    if (col.align === "right")
      c.s.text(text, cx + col.w - pad, cy, {
        size,
        face,
        align: "right",
        ...(color ? { color } : {}),
      });
    else if (col.align === "center")
      c.s.text(text, cx + col.w / 2, cy, {
        size,
        face,
        align: "center",
        ...(color ? { color } : {}),
      });
    else c.s.text(text, cx + pad, cy, { size, face, ...(color ? { color } : {}) });
  };
  if (o.head !== false && cols.some((col) => col.head)) {
    c.s.rect(x, y - 4, width, lead, { fill: o.headFill ?? [0.93, 0.94, 0.95] });
    let cx = x;
    for (const col of cols) {
      cell(col.head ?? "", col, cx, y, "sansB", o.headColor);
      cx += col.w;
    }
    y -= lead;
  }
  rows.forEach((row, i) => {
    if (o.zebra && i % 2 === 1) c.s.rect(x, y - 4, width, lead, { fill: o.zebra });
    let cx = x;
    const face: Face = o.bold?.has(i) ? "sansB" : (o.face ?? "sans");
    row.forEach((text, j) => {
      cell(text ?? "", cols[j]!, cx, y, face);
      cx += cols[j]!.w;
    });
    if (o.rules) c.s.line(x, y - 4.5, x + width, y - 4.5, [0.86, 0.87, 0.89], 0.4);
    y -= lead;
  });
  return y;
}

/** Section heading with a hairline, as statements and reports set them. */
export function heading(
  c: Ctx,
  text: string,
  y: number,
  o: { size?: number; face?: Face; color?: RGB; x?: number; width?: number } = {},
) {
  c.s.text(text, o.x ?? M, y, {
    size: o.size ?? 10,
    face: o.face ?? "sansB",
    color: o.color ?? INK,
  });
  c.s.line(o.x ?? M, y - 4, (o.x ?? M) + (o.width ?? R - M), y - 4, RULE, 0.6);
  return y - 16;
}

/**
 * The e-signature and indexing record a delivered copy carries: party, period, date and account
 * lines the intake reads, each on its own line, then the signature record and page count.
 */
export function record(c: Ctx, o: { meta?: boolean; y?: number; face?: Face } = {}) {
  const lines = [...(o.meta === false ? [] : metaLines(c.p, c.d)), signatureLine(c.d)];
  const top = o.y ?? 30 + lines.length * 8.2;
  c.s.line(M, top + 9, R, top + 9, RULE, 0.5);
  c.s.text("Electronic record", M, top, { size: 6.6, face: "sansB", color: MUTED });
  lines.forEach((line, i) => c.s.text(line, M, top - 8.2 * (i + 1), { size: 6.6, color: MUTED }));
  c.s.text(`Record SYNTHETIC-${c.p.id}-${c.d.id} · Page 1 of 1`, R, top, {
    size: 6.6,
    color: MUTED,
    align: "right",
  });
  return top + 18;
}

/** Notes authored on the plan, printed verbatim where a reader would see them. */
export function notes(c: Ctx, y: number, o: { x?: number; width?: number } = {}) {
  for (const note of c.d.notes) {
    const x = o.x ?? M;
    const lines = c.s.wrap(note, (o.width ?? R - M) - 14, 7.6, "sansI");
    c.s.rect(
      x,
      y - 4 - (lines.length - 1) * 10,
      o.width ?? R - M,
      9 + (lines.length - 1) * 10 + 4,
      {
        fill: [1, 0.97, 0.78],
      },
    );
    // A note that starts an index label (e.g. "Named party:") must start its own line.
    lines.forEach((line, i) =>
      c.s.text(line, x + 7, y - i * 10, { size: 7.6, face: "sansI", color: [0.32, 0.26, 0.05] }),
    );
    y -= lines.length * 10 + 8;
  }
  return y;
}

/** Visible synthetic marking, drawn last so it never displaces a document's own heading lines. */
export function synthetic(c: Ctx, o: { watermark?: boolean } = {}) {
  if (o.watermark !== false)
    c.s.rotated("SYNTHETIC SPECIMEN", 150, 250, 38, 54, [0.8, 0.82, 0.86], 0.28);
  c.s.rect(M - 4, 764, 92, 18, { fill: WHITE });
  c.s.text("SYNTHETIC", M, 769, { size: 13, face: "sansB", color: SYNTHETIC_RED });
}

/** A signature line with the signer's printed name beneath, as agreements close. */
export function signatureBlock(
  c: Ctx,
  x: number,
  y: number,
  o: { party: string; by?: string; title?: string; signed?: boolean; width?: number; face?: Face },
) {
  const w = o.width ?? 220,
    face = o.face ?? "serif";
  c.s.text(o.party.toUpperCase(), x, y, { size: 8.5, face: face === "serif" ? "serifB" : "sansB" });
  c.s.line(x, y - 22, x + w, y - 22, INK, 0.6);
  if (o.signed !== false)
    c.s.text("/s/ e-signed", x + 4, y - 19, { size: 10, face: "serifI", color: [0.1, 0.18, 0.45] });
  c.s.text(`By: ${o.by ?? "Authorized signatory"}`, x, y - 31, { size: 8, face });
  if (o.title) c.s.text(`Title: ${o.title}`, x, y - 41, { size: 8, face });
  return y - (o.title ? 52 : 42);
}

export { WHITE, INK, MUTED, RULE };
