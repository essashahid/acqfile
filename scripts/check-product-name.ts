/**
 * Finds the former product name in synthetic documents: PDF document information, XMP and
 * page text; Office document properties and parts; image metadata; and ZIP archives, including
 * ZIPs inside ZIPs (fixture batches, lender packages). Prints every hit and exits non-zero on any.
 *
 *   pnpm exec tsx scripts/check-product-name.ts [path ...]   (default: fixtures/)
 */
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import JSZip from "jszip";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";

const FORMER = /acq\s*file/i;
const DOCUMENT = /\.(pdf|docx|xlsx|zip|png|jpe?g|html)$/i;

/** Every decoded text form a PDF can hold a string in: literal, hex, UTF-16 and flate streams. */
function pdfTexts(bytes: Buffer): string[] {
  const out = [bytes.toString("latin1")];
  const raw = out[0]!;
  for (const m of raw.matchAll(/<([0-9A-Fa-f\s]{8,})>/g)) {
    const hex = m[1]!.replace(/\s+/g, "");
    const buf = Buffer.from(hex.length % 2 ? hex + "0" : hex, "hex");
    out.push(
      buf.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))
        ? buf.swap16().toString("utf16le")
        : buf.toString("latin1"),
    );
  }
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      out.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {
      /* not a flate stream */
    }
  }
  return out;
}

async function pdfInfo(bytes: Buffer): Promise<string[]> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const info = doc.context.lookup(doc.context.trailerInfo.Info);
    if (!(info instanceof PDFDict)) return [];
    return info
      .entries()
      .map(([k, v]) => {
        const value =
          v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : String(v);
        return `${k.asString()}=${value}`;
      })
      .filter((s) => s !== `${PDFName.of("Keywords").asString()}=`);
  } catch {
    return [];
  }
}

export async function scan(name: string, bytes: Buffer, hits: string[]) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip") || lower.endsWith(".docx") || lower.endsWith(".xlsx")) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      hits.push(`${name}: unreadable archive`);
      return;
    }
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const inner = await entry.async("nodebuffer");
      const label = `${name}!${entry.name}`;
      if (DOCUMENT.test(entry.name)) await scan(label, inner, hits);
      else if (FORMER.test(inner.toString("utf8")))
        hits.push(`${label}: ${match(inner.toString("utf8"))}`);
    }
    return;
  }
  if (lower.endsWith(".pdf")) {
    for (const field of await pdfInfo(bytes))
      if (FORMER.test(field)) hits.push(`${name}: info ${field}`);
    for (const text of pdfTexts(bytes))
      if (FORMER.test(text)) {
        hits.push(`${name}: ${match(text)}`);
        break;
      }
    return;
  }
  const text = bytes.toString("latin1");
  if (FORMER.test(text) || FORMER.test(bytes.toString("utf16le")))
    hits.push(`${name}: ${match(text) || "(UTF-16)"}`);
}

const match = (text: string) => {
  const m = FORMER.exec(text);
  return m ? JSON.stringify(text.slice(Math.max(0, m.index - 30), m.index + 40)) : "";
};

const walk = (p: string): string[] =>
  fs.statSync(p).isDirectory()
    ? fs
        .readdirSync(p)
        .flatMap((f) => walk(path.join(p, f)))
        .sort()
    : [p];

async function main() {
  const roots = process.argv.slice(2);
  const files = (roots.length ? roots : ["fixtures"]).flatMap(walk).filter((f) => DOCUMENT.test(f));
  const hits: string[] = [];
  for (const file of files) await scan(file, fs.readFileSync(file), hits);
  for (const h of hits) console.log(h);
  console.log(`${files.length} documents scanned; ${hits.length} with the former product name.`);
  if (hits.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) void main();
