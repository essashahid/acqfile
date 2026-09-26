/**
 * Tax documents printed on the official IRS page for their tax year, filled the way tax software
 * fills a return: values in the form's own boxes, plus the client-copy header and footer that
 * software prints in the margins. Anchors come from fixtures/forms/irs/layout.json.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { Doc, Plan } from "../../plans/shared";
import { display } from "./display";
import { amount, seeded, splitWhole, usDate } from "./format";
import { cityLine, factQuote, metaLines, partyName, signatureLine, street } from "./quotes";
import { drawPdfLib, Sheet, SYNTHETIC_RED, type Fonts, type RGB } from "./sheet";

type Box = [number, number, number, number];
type Layout = Record<string, { file: string; anchors: Record<string, Box> }>;
const ROOT = "fixtures/forms/irs";
let layout: Layout | null = null;
const forms = () =>
  (layout ??= JSON.parse(fs.readFileSync(path.join(ROOT, "layout.json"), "utf8")) as Layout);
const blanks = new Map<string, Buffer>();
const blank = (file: string) => {
  if (!blanks.has(file)) blanks.set(file, fs.readFileSync(path.join(ROOT, file)));
  return blanks.get(file)!;
};

export const IRS_TYPES = new Set(["TAX_PERSONAL", "TAX_BUSINESS", "TAX_EXTENSION", "IRS_4506C"]);
/** The form revision printed is the return's own tax year; a misfiled return keeps its filing period. */
export function formKey(d: Doc) {
  const year = String(d.facts["tax.year"] ?? d.period ?? "2025");
  const key =
    d.type === "TAX_PERSONAL"
      ? `1040-${year}`
      : d.type === "TAX_BUSINESS"
        ? `1120s-${year}`
        : d.type === "TAX_EXTENSION"
          ? `4868-${year}`
          : "4506c-2022";
  if (!forms()[key]) throw Error(`No official IRS page for ${d.type} ${year}`);
  return key;
}

const DATA: RGB = [0.05, 0.07, 0.22];
const SCALE = 0.94;
const OX = (612 - 612 * SCALE) / 2;
const OY = 10;
const ADDRESS = "14 Velnoric Way, Tazmervale, ZZ 00000";
const personAddress = (seed: string) =>
  `${120 + Math.floor(seeded(seed)() * 860)} Calder Ridge Road, Tazmervale, ZZ 00000`;
const activity = (name: string) =>
  /climate|hvac|air/i.test(name)
    ? { code: "238220", text: "HVAC services" }
    : /ground|lawn|landscap/i.test(name)
      ? { code: "561730", text: "Landscaping" }
      : /fitness|gym/i.test(name)
        ? { code: "713940", text: "Fitness center" }
        : { code: "811000", text: "Services" };

export async function irsPage(pdf: PDFDocument, fonts: Fonts, p: Plan, d: Doc) {
  const key = formKey(d);
  const form = forms()[key]!;
  // Printed at 94% on letter paper, as tax software's fit-to-page output is, leaving a margin
  // for the client-copy header. The official page is embedded whole, so its text leads the page.
  const [embedded] = await pdf.embedPdf(blank(form.file), [0]);
  const page = pdf.addPage([612, 792]);
  page.drawPage(embedded!, { x: OX, y: OY, xScale: SCALE, yScale: SCALE });
  const s = new Sheet(fonts);
  const a = Object.fromEntries(
    Object.entries(form.anchors).map(([k, [x, y, w, h]]) => [
      k,
      [OX + x * SCALE, OY + y * SCALE, w * SCALE, h * SCALE] as Box,
    ]),
  );
  /** A value in a form box: left-aligned text, or right-aligned amounts as return lines print. */
  const put = (k: string, text: string, align: "left" | "right" = "left", printed = 8.5) => {
    const size = printed * SCALE;
    const box = a[k];
    if (!box || !text) return;
    const [x, y, w, h] = box;
    const baseline = y + Math.max(2, (h - size * 0.72) / 2);
    s.text(text, align === "right" ? x + w - 3 : x + 3, baseline, {
      size,
      align,
      color: DATA,
    });
  };
  const mark = (k: string) => {
    const box = a[k];
    if (box)
      s.text("X", box[0] + 1.2, box[1] + 1.2, { size: 8 * SCALE, face: "sansB", color: DATA });
  };
  const rng = seeded(`${p.id}:${d.id}:${key}`);
  const round = (n: number) => Math.round(n / 10) * 10;
  const name = String(d.facts["party.legal_name"] ?? partyName(p, d));

  if (d.type === "TAX_PERSONAL") {
    const parts = partyName(p, d).split(" ");
    put("first", parts.slice(0, -1).join(" "));
    put("last", parts.at(-1)!);
    if (d.facts["party.identifier"] !== undefined) put("ssn", display(d.facts["party.identifier"]));
    const address = personAddress(d.party);
    put("street", street(address));
    const [city, rest = ""] = cityLine(address).split(", ");
    const [state, zip] = rest.split(" ");
    put("city", city!);
    put("state", state!);
    put("zip", zip!);
    const wages = round(88_000 + rng() * 60_000);
    const interest = round(300 + rng() * 2_400);
    const dividends = round(200 + rng() * 3_100);
    const other = round(6_000 + rng() * 22_000);
    const total = wages + interest + dividends + other;
    const adjustments = round(1_500 + rng() * 4_000);
    const agi = total - adjustments;
    const standard = { "2022": 12_950, "2023": 13_850, "2024": 14_600 }[key.slice(5)] ?? 0;
    put("line1a", amount(wages), "right");
    put("line1z", amount(wages), "right");
    put("line2b", amount(interest), "right");
    put("line3b", amount(dividends), "right");
    put("line8", amount(other), "right");
    put("line9", amount(total), "right");
    put("line10", amount(adjustments), "right");
    put("line11", amount(agi), "right");
    put("line11a", amount(agi), "right");
    if (standard) {
      put("line12", amount(standard), "right");
      put("line14", amount(standard), "right");
      put("line15", amount(agi - standard), "right");
    }
  }

  if (d.type === "TAX_BUSINESS") {
    const address = String(d.facts["party.address"] ?? ADDRESS);
    const act = activity(name);
    put("name", name);
    if (d.facts["party.identifier"] !== undefined) put("ein", display(d.facts["party.identifier"]));
    put("street", street(address));
    if (a.city) put("city", cityLine(address));
    else {
      const [city, rest = ""] = cityLine(address).split(", ");
      const [state, zip] = rest.split(" ");
      put("cityonly", city!);
      put("state", state!);
      put("zip", zip!);
    }
    put("election", "01/01/2019");
    put("activity", act.code);
    put("incorporated", "03/12/2018");
    put("assets", amount(p.model.assets), "right");
    put("shareholders", "1", "right");
    const receipts = Number(d.facts["tax.gross_receipts"] ?? p.model.years[d.period!]?.revenue);
    const income = Number(d.facts["tax.net_income"] ?? p.model.years[d.period!]?.income);
    const cogs = round(receipts * (0.44 + rng() * 0.04));
    const gross = receipts - cogs;
    const [officers, salaries, repairs, rents, taxes, depreciation, advertising, other] =
      splitWhole(gross - income, [18, 34, 3, 9, 5, 6, 2, 8]);
    const deductions =
      officers! + salaries! + repairs! + rents! + taxes! + depreciation! + advertising! + other!;
    put("line1a", amount(receipts), "right");
    put("line1b", "0", "right");
    put("line1c", amount(receipts), "right");
    put("line2", amount(cogs), "right");
    put("line3", amount(gross), "right");
    put("line6", amount(gross), "right");
    put("line7", amount(officers!), "right");
    put("line8", amount(salaries!), "right");
    put("line9", amount(repairs!), "right");
    put("line11", amount(rents!), "right");
    put("line12", amount(taxes!), "right");
    put("line14", amount(depreciation!), "right");
    put("line16", amount(advertising!), "right");
    put("line20", amount(other!), "right");
    put("line21", amount(deductions), "right");
    put("line22", amount(gross - deductions), "right");
    if (gross - deductions !== income) throw Error(`1120-S does not tie out for ${d.id}`);
    const [sx, sy] = a.signature!;
    s.text("Electronically signed — Form 8879-S on file", sx, sy + 9 * SCALE, {
      size: 7.5 * SCALE,
      color: DATA,
    });
    const [dx, dy] = a.signdate!;
    if (d.metadata.dated && d.metadata.signature_date)
      s.text(usDate(d.metadata.signature_date), dx, dy + 9 * SCALE, {
        size: 7.5 * SCALE,
        color: DATA,
      });
    put("title", "President", "left", 7.5);
    put("preparer", "Morgan Vale, CPA", "left", 7.5);
    put("ptin", "P01735520", "left", 7.5);
    put("firm", "Vale & Reed CPAs LLP", "left", 7.5);
    put("firmaddress", "88 Orlanne Street, Tazmervale, ZZ 00000", "left", 7.5);
    put("firmphone", "(202) 555-0156", "left", 7.5);
  }

  if (d.type === "TAX_EXTENSION") {
    const personal = p.documents.find(
      (x) => x.type === "TAX_PERSONAL" && x.party === d.party && x.facts["party.identifier"],
    );
    const address = personAddress(d.party);
    const [city, rest = ""] = cityLine(address).split(", ");
    const [state, zip] = rest.split(" ");
    put("name", partyName(p, d));
    put("address", street(address));
    put("city", city!);
    put("state", state!);
    put("zip", zip!);
    if (personal) put("ssn", display(personal.facts["party.identifier"]));
    const liability = round(14_000 + rng() * 9_000);
    const paid = round(liability * 0.82);
    put("line4", amount(liability), "right");
    put("line5", amount(paid), "right");
    put("line6", amount(liability - paid), "right");
    put("line7", amount(liability - paid), "right");
  }

  if (d.type === "IRS_4506C") {
    const address = String(d.facts["party.address"] ?? ADDRESS);
    const [city, rest = ""] = cityLine(address).split(", ");
    const [state, zip] = rest.split(" ");
    put("name", name, "left", 7.5);
    if (d.facts["party.identifier"] !== undefined) put("tin", display(d.facts["party.identifier"]));
    put("street", street(address));
    put("city", city!);
    put("state", state!);
    put("zip", zip!);
    put("ives", "Tazmervale Verification Services LLC", "left", 7.5);
    put("ivesid", "TVS0417", "left", 7.5);
    put("sor", "SOR-TVS-0417", "left", 7.5);
    put("ivesstreet", "400 Merrow Avenue", "left", 7.5);
    put("ivescity", "Tazmervale", "left", 7.5);
    put("ivesstate", "ZZ", "left", 7.5);
    put("iveszip", "00000", "left", 7.5);
    put("filenumber", `ZB-2026-${d.id.toUpperCase()}`.slice(0, 30), "left", 7.5);
    put("client", "Zelmivar Bank, 1 Harrow Plaza, Tazmervale, ZZ 00000", "left", 7.5);
    put("clientphone", "(202) 555-0163", "left", 7.5);
    put("form", "1120S");
    mark("returntranscript");
    ["2023", "2024", "2025"].forEach((y, i) => {
      put(`year${i + 1}m`, "12");
      put(`year${i + 1}d`, "31");
      put(`year${i + 1}y`, y);
    });
    mark("attest");
    put("signature", "Electronically signed", "left", 8);
    if (d.metadata.dated && d.metadata.signature_date)
      put("signdate", usDate(d.metadata.signature_date));
    put("phone", "(202) 555-0147");
    put("printname", "Authorized officer");
    put("title", "President");
  }

  // Client-copy margins, as tax software prints them: index lines at the top, e-file record below.
  const formYear = key.split("-")[1];
  const code =
    d.type === "TAX_BUSINESS"
      ? `Form ${String(d.facts["tax.form_type"] ?? "1120S")}`
      : d.type === "TAX_PERSONAL"
        ? "Form 1040"
        : "";
  const header = [...metaLines(p, d), ...(code ? [`${code} (${formYear}) — client copy`] : [])];
  header.forEach((line, i) =>
    s.text(line, 330, 786 - i * 7.2, { size: 6.4, color: [0.25, 0.27, 0.32] }),
  );
  // Top margin only: the forms' own footers differ by revision and fill the bottom edge.
  s.text(signatureLine(d), 36, 768, { size: 6.4, color: [0.25, 0.27, 0.32] });
  s.text("Page 1 of 1 · Synthetic data for testing; not a filed return", 36, 761, {
    size: 6.4,
    color: [0.25, 0.27, 0.32],
  });
  for (const [i, note] of d.notes.entries()) {
    const y = 781 - i * 10;
    s.rect(128, y - 3, s.width(note, 7) + 8, 11, { fill: [1, 0.96, 0.62] });
    s.text(note, 132, y, { size: 7, color: [0.3, 0.24, 0.02] });
  }
  s.text("SYNTHETIC", 36, 778, { size: 12, face: "sansB", color: SYNTHETIC_RED });
  drawPdfLib(page, fonts, s.ops);
  // Quotes the truth file cites must be on this page; fail at authoring time, not in evaluation.
  const text = s.strings().join(" ");
  for (const attribute of Object.keys(d.facts)) {
    if (d.type === "TAX_BUSINESS" && attribute === "tax.year") continue; // printed by the form itself
    const quote = factQuote(d, attribute);
    if (!text.includes(quote)) throw Error(`${d.id}: ${attribute} quote not drawn: ${quote}`);
  }
}
