/**
 * Fixture authoring only. Downloads the official IRS forms the synthetic tax documents are printed
 * on, keeps the one page each document uses, removes the fillable fields so the page is flat, and
 * records where each value sits by matching the form's printed labels to its field boxes.
 * Output: fixtures/forms/irs/*.pdf and fixtures/forms/irs/layout.json (committed, reviewable).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";

type Box = [x: number, y: number, w: number, h: number];
type Source = { key: string; url: string; page: number; kind: "1040" | "1120s" | "4868" | "4506c" };
export const IRS_SOURCES: Source[] = [
  {
    key: "1040-2022",
    url: "https://www.irs.gov/pub/irs-prior/f1040--2022.pdf",
    page: 1,
    kind: "1040",
  },
  {
    key: "1040-2023",
    url: "https://www.irs.gov/pub/irs-prior/f1040--2023.pdf",
    page: 1,
    kind: "1040",
  },
  {
    key: "1040-2024",
    url: "https://www.irs.gov/pub/irs-prior/f1040--2024.pdf",
    page: 1,
    kind: "1040",
  },
  { key: "1040-2025", url: "https://www.irs.gov/pub/irs-pdf/f1040.pdf", page: 1, kind: "1040" },
  {
    key: "1120s-2023",
    url: "https://www.irs.gov/pub/irs-prior/f1120s--2023.pdf",
    page: 1,
    kind: "1120s",
  },
  {
    key: "1120s-2024",
    url: "https://www.irs.gov/pub/irs-prior/f1120s--2024.pdf",
    page: 1,
    kind: "1120s",
  },
  { key: "1120s-2025", url: "https://www.irs.gov/pub/irs-pdf/f1120s.pdf", page: 1, kind: "1120s" },
  { key: "4868-2025", url: "https://www.irs.gov/pub/irs-pdf/f4868.pdf", page: 1, kind: "4868" },
  { key: "4506c-2022", url: "https://www.irs.gov/pub/irs-pdf/f4506c.pdf", page: 1, kind: "4506c" },
];
const OUT = "fixtures/forms/irs";
const CACHE = ".data/irs-originals";

type Item = { s: string; x: number; y: number };
type Widget = { name: string; x: number; y: number; w: number; h: number };

async function original(src: Source) {
  const file = path.join(CACHE, path.basename(new URL(src.url).pathname));
  if (!fs.existsSync(file)) {
    const res = await fetch(src.url);
    if (!res.ok) throw Error(`${src.url}: HTTP ${res.status}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

async function geometry(bytes: Buffer, pageNo: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  const content = await (await doc.getPage(pageNo)).getTextContent();
  const items: Item[] = content.items.flatMap((i) =>
    "str" in i && i.str.trim() ? [{ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }] : [],
  );
  await task.destroy();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = pdf.getPages()[pageNo - 1]!;
  const widgets: Widget[] = [];
  for (const field of pdf.getForm().getFields())
    for (const w of field.acroField.getWidgets())
      if (w.P() === page.ref) {
        const r = w.getRectangle();
        widgets.push({
          name: field.getName().split(".").at(-1)!,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        });
      }
  widgets.sort((a, b) => b.y - a.y || a.x - b.x);
  return { items, widgets };
}

function resolver(items: Item[], widgets: Widget[]) {
  const box = (w: Widget): Box => [w.x, w.y, w.w, w.h];
  const label = (re: RegExp, nth = 0) => {
    const found = items.filter((i) => re.test(i.s)).sort((a, b) => b.y - a.y || a.x - b.x)[nth];
    if (!found) throw Error(`Label not found: ${re}`);
    return found;
  };
  return {
    /** The entry box printed under a label. */
    below(re: RegExp, nth = 0): Box {
      const l = label(re, nth);
      const w = widgets
        .filter(
          (w) =>
            w.y + w.h <= l.y + 2 && w.y + w.h >= l.y - 24 && w.x <= l.x + 6 && w.x + w.w >= l.x,
        )
        .sort((a, b) => b.y + b.h - (a.y + a.h))[0];
      if (!w) throw Error(`No box below ${re}`);
      return box(w);
    },
    /** The entry box printed above a label, as on signature rows. */
    above(re: RegExp): Box {
      const l = label(re);
      const w = widgets
        .filter((w) => w.y >= l.y - 2 && w.y <= l.y + 14 && w.x <= l.x + 6 && w.x + w.w >= l.x)
        .sort((a, b) => a.y - b.y)[0];
      if (!w) throw Error(`No box above ${re}`);
      return box(w);
    },
    /** The first box to the right of a label on its own row. */
    after(re: RegExp): Box {
      const l = label(re);
      const w = widgets
        .filter((w) => w.x > l.x && Math.abs(w.y + w.h / 2 - (l.y + 3)) <= 8)
        .sort((a, b) => a.x - b.x)[0];
      if (!w) throw Error(`No box after ${re}`);
      return box(w);
    },
    /** The amount box at the right edge of a numbered return line. */
    line(token: string): Box | null {
      const t = items.find((i) => i.s === token && i.x >= 470 && i.x <= 500);
      if (!t) return null;
      const w = widgets
        .filter((w) => w.x >= 490 && Math.abs(w.y + w.h / 2 - (t.y + 3)) <= 7)
        .sort((a, b) => a.x - b.x)[0];
      return w ? box(w) : [504, t.y - 2, 72, 12];
    },
    /** The label's own position, for text printed beside it. */
    at(re: RegExp): Box {
      const l = label(re);
      return [l.x, l.y, 0, 0];
    },
    named(name: string, nth = 0): Box {
      const w = widgets.filter((w) => w.name === name)[nth];
      if (!w) throw Error(`No field ${name}#${nth}`);
      return box(w);
    },
  };
}

function anchors(kind: Source["kind"], r: ReturnType<typeof resolver>) {
  const a: Record<string, Box> = {};
  const set = (key: string, value: Box | null) => {
    if (value) a[key] = value.map((n) => Math.round(n * 10) / 10) as Box;
  };
  if (kind === "1040") {
    set("first", r.below(/^Your first name and middle initial/));
    set("last", r.below(/^Last name$/));
    set("ssn", r.below(/^Your social security number$/));
    set("street", r.below(/^Home address \(number and street\)/));
    set("city", r.below(/^City, town, or post office/));
    set("state", r.below(/^State$/));
    set("zip", r.below(/^ZIP code$/));
    for (const t of [
      "1a",
      "1z",
      "2b",
      "3b",
      "7",
      "7a",
      "8",
      "9",
      "10",
      "11",
      "11a",
      "12",
      "13",
      "14",
      "15",
    ])
      set(`line${t}`, r.line(t));
  }
  if (kind === "1120s") {
    set("name", r.below(/^Name$/));
    set("ein", r.below(/Employer identification number$/));
    // Through 2024 the address is two lines; from 2025 it is split into street, city, state and ZIP.
    try {
      set("street", r.below(/^Number, street, and room or suite no/));
      set("city", r.below(/^City or town, state or province/));
    } catch {
      set("street", r.below(/^Number and street/));
      set("cityonly", r.below(/^City or town$/));
      set("state", r.below(/^State or province$/));
      set("zip", r.below(/^ZIP or foreign postal code$/));
    }
    set("election", r.below(/^S election effective date$/));
    set("activity", r.below(/^number \(see instructions\)$/));
    set("incorporated", r.below(/^Date incorporated$/));
    set("assets", r.below(/^Total assets \(see instructions\)$/));
    set("shareholders", r.after(/^Enter the number of shareholders/));
    set("line1a", r.after(/^Gross receipts or sales$/));
    set("line1b", r.after(/^Less returns and allowances$/));
    for (const t of [
      "1c",
      "2",
      "3",
      "6",
      "7",
      "8",
      "9",
      "11",
      "12",
      "14",
      "16",
      "17",
      "19",
      "20",
      "21",
      "22",
    ])
      set(`line${t}`, r.line(t));
    set("signature", r.at(/^Signature of officer$/));
    set("signdate", r.at(/^Date$/));
    // The officer's title box sits above its label through 2024 and beside it from 2025.
    try {
      set("title", r.above(/^Title$/));
    } catch {
      set("title", r.after(/^Title$/));
    }
    set("preparer", r.below(/^(Print\/Type )?[Pp]reparer’s name$/));
    set("ptin", r.below(/^PTIN$/));
    set("firm", r.after(/^Firm’s name$/));
    set("firmaddress", r.after(/^Firm’s address$/));
    set("firmphone", r.after(/^Phone no\.$/));
  }
  if (kind === "4868") {
    set("name", r.named("f1_4[0]"));
    set("address", r.named("f1_5[0]"));
    set("city", r.named("f1_6[0]"));
    set("state", r.named("f1_7[0]"));
    set("zip", r.named("f1_8[0]"));
    set("ssn", r.named("f1_9[0]"));
    set("line4", r.named("f1_11[0]"));
    set("line5", r.named("f1_12[0]"));
    set("line6", r.named("f1_13[0]"));
    set("line7", r.named("f1_14[0]"));
  }
  if (kind === "4506c") {
    set("name", r.named("last_name[0]", 0));
    set("tin", r.named("first_ssn[0]", 0));
    set("street", r.named("street_address[0]", 0));
    set("city", r.named("city[0]", 0));
    set("state", r.named("state[0]", 0));
    set("zip", r.named("zip_code[0]", 0));
    set("ives", r.named("ives_participant_name[0]", 0));
    set("ivesid", r.named("ives_participant_id[0]", 0));
    set("sor", r.named("sor_mailbox_id[0]", 0));
    set("ivesstreet", r.named("street_address[0]", 2));
    set("ivescity", r.named("city[0]", 2));
    set("ivesstate", r.named("state[0]", 2));
    set("iveszip", r.named("zip_code[0]", 2));
    set("filenumber", r.named("customer_file_number[0]", 0));
    set("client", r.named("first_name[0]", 2));
    set("clientphone", r.named("telephone_number[0]", 0));
    set("form", r.named("transcript_reqeust[0]", 0));
    set("returntranscript", r.named("return_transcript[0]", 0));
    for (const [i, base] of [15, 18, 21].entries()) {
      set(`year${i + 1}m`, r.named(`f1_${base}[0]`));
      set(`year${i + 1}d`, r.named(`f1_${base + 1}[0]`));
      set(`year${i + 1}y`, r.named(`f1_${base + 2}[0]`));
    }
    set("attest", r.named("signature_attests[0]", 0));
    set("signature", r.named("signature[0]", 0));
    set("signdate", r.named("date[0]", 0));
    set("phone", r.named("phone_number[0]", 0));
    set("printname", r.named("print_type_name[0]", 0));
    set("title", r.named("title[0]", 0));
  }
  return a;
}

/** One flat page: the official artwork and printed text, without fields, scripts or XFA. */
async function trim(bytes: Buffer, pageNo: number) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const [page] = await out.copyPages(source, [pageNo - 1]);
  page!.node.delete(PDFName.of("Annots"));
  out.addPage(page!);
  const fixed = new Date("2026-09-15T12:00:00Z");
  out.setCreationDate(fixed);
  out.setModificationDate(fixed);
  out.setProducer("AcqFile synthetic fixtures (official IRS page, fields removed)");
  out.setCreator("AcqFile synthetic fixtures");
  return Buffer.from(await out.save({ useObjectStreams: false }));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const layout: Record<string, unknown> = {};
  for (const src of IRS_SOURCES) {
    const bytes = await original(src);
    const { items, widgets } = await geometry(bytes, src.page);
    const file = `${src.key}.pdf`;
    const flat = await trim(bytes, src.page);
    fs.writeFileSync(path.join(OUT, file), flat);
    layout[src.key] = {
      file,
      source: src.url,
      source_sha256: createHash("sha256").update(bytes).digest("hex"),
      page: src.page,
      anchors: anchors(src.kind, resolver(items, widgets)),
    };
    console.log(`${src.key}: page ${src.page} -> ${file} (${flat.length} bytes)`);
  }
  fs.writeFileSync(path.join(OUT, "layout.json"), JSON.stringify(layout, null, 2) + "\n");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
