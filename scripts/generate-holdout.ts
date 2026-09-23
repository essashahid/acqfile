// Does not import demo plans, candidates or test expectations. Never registered in a mock lookup.
import fs from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";
import { rasterBytes } from "../fixtures/demo/raster";
import { FIXED_DATE, normalizedZip } from "../fixtures/lib/render";
async function pdf(lines: string[]) {
  const p = await PDFDocument.create();
  p.setCreationDate(FIXED_DATE);
  p.setModificationDate(FIXED_DATE);
  const font = await p.embedFont(StandardFonts.Courier);
  p.addPage([612, 792]).drawText(lines.join("\n\n"), { x: 45, y: 720, size: 11, font });
  return Buffer.from(await p.save({ useObjectStreams: false }));
}
async function main() {
  const root = "fixtures/holdout/U01";
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    `${root}/signed-copy.pdf`,
    await pdf([
      "SYNTHETIC / U01 / example only",
      "SALE MEMORANDUM - 28 August 2026",
      "Quenby Acquisition LLC will buy the service assets of",
      "Ostrelyva Fitness LLC for seven hundred eighty thousand",
      "US dollars ($780,000). Other costs are separate.",
      "The two fictional parties signed this memorandum below.",
      "Buyer: Morgan Vale / Seller: Casey Reed",
      "Contact: holdout@example.com",
    ]),
  );
  fs.writeFileSync(
    `${root}/tax-copy.pdf`,
    await pdf([
      "SYNTHETIC / U01",
      "Form 1120-S / period ended December 31, 2024",
      "Ostrelyva Fitness LLC",
      "Gross receipts $960,000; ordinary income $84,000.",
      "Prepared for this demonstration. No other tax years enclosed.",
    ]),
  );
  const scan = await rasterBytes(
    await pdf([
      "SYNTHETIC / U01",
      "Buyer's handwritten cash worksheet - specimen",
      "Available cash: $1?0,000",
      "The middle digit could not be confirmed.",
      "Please compare with a clear account statement.",
      "Quenby Acquisition LLC / holdout@example.com",
    ]),
  );
  fs.writeFileSync(`${root}/IMG_042.pdf`, scan.bytes);
  const wb = XLSX.utils.book_new();
  wb.Props = { Author: "SYNTHETIC", CreatedDate: FIXED_DATE, ModifiedDate: FIXED_DATE };
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["SYNTHETIC / accountant's closing worksheet"],
      ["Quenby Acquisition LLC"],
      ["Consideration for service assets", 805000],
      ["Working cash and expenses", 95000],
      ["Total uses", 900000],
      [],
      ["Borrowed funds", 720000],
      ["Buyer's funds", 180000],
      ["Total sources", 900000],
      ["Prepared 08/29/2026; holdout@example.com"],
    ]),
    "Closing worksheet",
  );
  fs.writeFileSync(
    `${root}/book2.xlsx`,
    await normalizedZip(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
  );
  console.log(
    "U01 authored: not registered with any prepared extractor; human source review and live reading pending.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
