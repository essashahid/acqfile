import { describe, expect, it } from "vitest";
import fs from "node:fs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { FIXTURE_PRODUCER, IRS_PAGE_PRODUCER, RASTER_PRODUCER } from "../../fixtures/lib/producer";
import { scan } from "../../scripts/check-product-name";

const manifest = (deal: string) =>
  JSON.parse(fs.readFileSync(`fixtures/deals/${deal}/manifest.json`, "utf8")) as {
    files: { path: string; format: string }[];
  };
const first = (deal: string, format: string) =>
  `fixtures/deals/${deal}/${manifest(deal).files.find((f) => f.format === format)!.path}`;
const info = async (file: string) => {
  const pdf = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  return [pdf.getCreator(), pdf.getProducer()];
};

describe("synthetic fixtures name a neutral generator, not a product", () => {
  it("text, official-form, IRS-page and image-only PDFs", async () => {
    expect(await info(first("deal-a", "text_pdf"))).toEqual([FIXTURE_PRODUCER, FIXTURE_PRODUCER]);
    expect(await info(first("deal-a", "acroform_pdf"))).toEqual([
      FIXTURE_PRODUCER,
      FIXTURE_PRODUCER,
    ]);
    expect(await info("fixtures/forms/irs/1040-2025.pdf")).toEqual([
      FIXTURE_PRODUCER,
      IRS_PAGE_PRODUCER,
    ]);
    expect(await info(first("deal-c", "scan_pdf"))).toEqual([RASTER_PRODUCER, RASTER_PRODUCER]);
  });

  it("Office documents", async () => {
    const docx = await JSZip.loadAsync(fs.readFileSync(first("deal-a", "docx")));
    const core = await docx.file("docProps/core.xml")!.async("string");
    expect(core).toContain(`<dc:creator>${FIXTURE_PRODUCER}</dc:creator>`);
  });

  it("the scanner finds a former name in metadata, text and nested archives", async () => {
    const pdf = await PDFDocument.create();
    pdf.setProducer("AcqFile synthetic fixtures");
    pdf.addPage();
    const zip = new JSZip();
    zip.file("inner.pdf", await pdf.save());
    const hits: string[] = [];
    await scan("outer.zip", await zip.generateAsync({ type: "nodebuffer" }), hits);
    expect(hits.some((h) => h.startsWith("outer.zip!inner.pdf: info /Producer=AcqFile"))).toBe(
      true,
    );
    const clean: string[] = [];
    await scan("batch.zip", fs.readFileSync("fixtures/deals/deal-a/batch-1.zip"), clean);
    expect(clean).toEqual([]);
  });
});
