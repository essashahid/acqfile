import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import PDFKit from "pdfkit";
import JSZip from "jszip";
import type { Doc, Plan } from "../plans/shared";
import { officialForm } from "../../src/lib/config/official-form-fields";
import { officialPdf, verifyOfficial } from "./official";
import { fingerprint, isIrs, templateOps, type PageOptions } from "./doc";
import { irsPage } from "./doc/irs";
import { businessPlanDocx, financialWorkbook } from "./doc/office";
import { drawPdfKit, drawPdfLib, embedFonts } from "./doc/sheet";
export const FIXED_DATE = new Date("2026-09-15T12:00:00.000Z");
export const PASSWORD = "SYNTHETIC-FIXTURE-PASSWORD";
export async function normalizedZip(bytes: Buffer) {
  const input = await JSZip.loadAsync(bytes);
  const out = new JSZip();
  for (const name of Object.keys(input.files).sort()) {
    const f = input.files[name]!;
    out.file(name, await f.async("nodebuffer"), {
      date: FIXED_DATE,
      dir: f.dir,
      createFolders: false,
    });
  }
  return out.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
}
/**
 * One page per document, drawn from its real-world template. Official SBA forms keep their own
 * AcroForm path; IRS returns are printed on the official IRS page for their tax year.
 */
export async function textPdf(p: Plan, docs: Doc[], acro = false, o: PageOptions = {}) {
  if (docs.length === 1 && officialForm(docs[0]!.type)) return officialPdf(p, docs[0]!);
  if (acro) throw Error("Only official SBA forms are authored as fillable PDFs");
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  pdf.setCreator("AcqFile synthetic fixtures");
  pdf.setProducer("AcqFile synthetic fixtures");
  pdf.setKeywords([fingerprint(docs)]);
  const fonts = await embedFonts(pdf);
  for (const d of docs) {
    if (isIrs(d)) await irsPage(pdf, fonts, p, d);
    else drawPdfLib(pdf.addPage([612, 792]), fonts, await templateOps(p, d, o));
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
export async function protectedPdf(p: Plan, docs: Doc[]) {
  const pages = await Promise.all(docs.map((d) => templateOps(p, d)));
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFKit({
      autoFirstPage: false,
      pdfVersion: "1.4",
      userPassword: PASSWORD,
      ownerPassword: "SYNTHETIC-OWNER-ONLY",
      info: {
        Title: "Synthetic formation document",
        Author: "AcqFile",
        CreationDate: FIXED_DATE,
        ModDate: FIXED_DATE,
        Keywords: fingerprint(docs),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    for (const ops of pages) {
      doc.addPage({ size: "LETTER", margin: 0 });
      drawPdfKit(doc, ops);
    }
    doc.end();
  });
}
export async function docx(p: Plan, docs: Doc[]) {
  return normalizedZip(await businessPlanDocx(p, docs));
}
export async function xlsx(p: Plan, docs: Doc[]) {
  return normalizedZip(await financialWorkbook(p, docs));
}
// Poppler/fonts can differ by host. Committed image-only PDFs are canonical A22 artifacts.
export async function rasterPdf(p: Plan, docs: Doc[]) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "acqfile-raster-"));
  try {
    fs.writeFileSync(path.join(temp, "text.pdf"), await textPdf(p, docs));
    execFileSync(
      "pdftoppm",
      ["-png", "-r", "120", path.join(temp, "text.pdf"), path.join(temp, "page")],
      { stdio: "pipe" },
    );
    const pdf = await PDFDocument.create();
    pdf.setCreationDate(FIXED_DATE);
    pdf.setModificationDate(FIXED_DATE);
    pdf.setCreator("AcqFile synthetic raster fixtures");
    pdf.setProducer("AcqFile synthetic raster fixtures");
    pdf.setKeywords([fingerprint(docs)]);
    for (const file of fs
      .readdirSync(temp)
      .filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))) {
      const image = await pdf.embedPng(fs.readFileSync(path.join(temp, file)));
      const page = pdf.addPage([612, 792]);
      page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    }
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
export async function verifyAcroform(bytes: Buffer, docs: Doc[]) {
  if (docs.length === 1 && officialForm(docs[0]!.type)) return verifyOfficial(bytes, docs[0]!);
  throw Error("Only official SBA forms carry AcroForm fields");
}
