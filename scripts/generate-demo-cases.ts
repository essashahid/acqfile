import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { DEMO_CASES } from "../src/lib/demo/registry";
import { demoRaster } from "../fixtures/demo/raster";
import { casePlan } from "../fixtures/demo/plans";
import { documents } from "../fixtures/lib/truth";
import { textPdf, docx, xlsx, protectedPdf, FIXED_DATE } from "../fixtures/lib/render";
import { templateOps } from "../fixtures/lib/doc";
import { drawPdfLib, embedFonts } from "../fixtures/lib/doc/sheet";
import type { Doc, Plan } from "../fixtures/plans/shared";
const root = "fixtures/demo/generated";
const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const json = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};
async function main() {
  const cache = new Map<string, { bytes: Buffer; file: string }>();
  const candidates = new Map<string, unknown>();
  for (const c of DEMO_CASES) {
    const p = casePlan(c.id);
    const normalized = structuredClone(p);
    if (c.id === "D03") {
      const d = normalized.documents.find((d) => d.id === "pfs")!;
      delete d.facts["pfs.total_liabilities"];
      delete d.facts["pfs.total_assets"];
      d.facts["pfs.cash"] = 25000.5;
      d.facts["pfs.net_worth"] = -25000;
      d.facts["pfs.as_of_date"] = "2026-08-31";
    }
    const authored = documents(normalized);
    const files = [];
    const archives = new Map<number, JSZip>();
    for (const d of p.documents) {
      const original = d.duplicate_of ? p.documents.find((x) => x.id === d.duplicate_of)! : d;
      const key = hash(JSON.stringify(original));
      let rendered = cache.get(key);
      if (!rendered) {
        const ext =
          original.format === "docx" ? "docx" : original.format === "xlsx" ? "xlsx" : "pdf";
        const file =
          original.batch > 1 ? `${c.id}/${original.path}` : `shared/${key.slice(0, 20)}.${ext}`;
        const target = path.join(root, file);
        // Protected and raster files are canonical artifacts, independent of local raster/encryption randomness.
        const canonical =
          !process.argv.includes("--rebuild-scans") &&
          ["scan_pdf", "protected_pdf"].includes(original.format) &&
          fs.existsSync(target);
        const bytes = canonical ? fs.readFileSync(target) : await render(p, original, c.id);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        rendered = { bytes, file };
        cache.set(key, rendered);
      }
      const sha = hash(rendered.bytes);
      files.push({
        path: d.path,
        stored: rendered.file,
        sha256: sha,
        batch: d.batch,
        document: d.id,
      });
      const candidate = authored.find((x) => x.file === d.path)!;
      if (d.id === "mixed-bundle") {
        candidate.pages = 6;
        const agreement = candidate.segments[0]!;
        agreement.page_end = 2;
        agreement.expected_page_count = 2;
        agreement.metadata_locator.quote = "Signed: Synthetic specimen";
        agreement.metadata_locator.page = 2;
        for (const [i, party] of ["alex", "bea"].entries())
          candidate.segments.push({
            ...agreement,
            id: `supplement-${party}`,
            doc_type: "OTHER_NOT_REQUIRED",
            party_id: party,
            page_start: 3 + i * 2,
            page_end: 4 + i * 2,
            metadata_locator: {
              ...agreement.metadata_locator,
              page: 3 + i * 2,
              quote: "Signed: Synthetic specimen",
            },
          });
        // Authored narrative wording on original page 1.
      }
      if (!d.duplicate_of) {
        // The mock reads answers by file hash: one file may not carry two different answers.
        const prior = candidates.get(sha) as { facts: unknown } | undefined;
        if (prior && JSON.stringify(prior.facts) !== JSON.stringify(candidate.facts))
          throw Error(`${c.id}/${d.id}: renders identical to a document with different facts`);
        candidates.set(sha, { ...candidate, hash: sha, parties: p.parties });
      }
      const zip = archives.get(d.batch) ?? new JSZip();
      zip.file(d.path, rendered.bytes, { date: FIXED_DATE });
      archives.set(d.batch, zip);
    }
    const draft = {
      as_of: p.as_of,
      profile: p.profile,
      parties: p.parties,
      ownership: p.ownership,
    };
    json(`${root}/${c.id}/manifest.json`, { id: c.id, draft, files });
    for (const [batch, zip] of archives) {
      zip.forEach((_path, entry) => {
        entry.date = FIXED_DATE;
      });
      fs.writeFileSync(
        `${root}/${c.id}/round-${batch}.zip`,
        await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
      );
    }
  }
  json(`${root}/prepared-candidates.json`, [...candidates.values()]);
  console.log(
    `Generated eight cases using ${cache.size} unique documents; prepared candidates only, no evaluated answers.`,
  );
}
async function render(p: Plan, d: Doc, caseId: string) {
  if (d.id === "mixed-bundle") {
    const pdf = await PDFDocument.create();
    pdf.setCreationDate(FIXED_DATE);
    pdf.setModificationDate(FIXED_DATE);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fonts = await embedFonts(pdf);
    const names = [
      "Varnholt Acquisition LLC / Varnholt Climate Services LLC",
      p.parties.find((p) => p.id === "alex")!.legal_name,
      p.parties.find((p) => p.id === "bea")!.legal_name,
    ];
    for (let i = 0; i < 6; i++) {
      const page = pdf.addPage([612, 792]);
      const title = i < 2 ? "Purchase agreement" : "Personal financial statement (supplement)";
      // Page 1 is the agreement's own first page; the rest keep the authored packet wording.
      if (i === 0) {
        drawPdfLib(page, fonts, await templateOps(p, d, { pageLabel: "Page 1 of 2" }));
        continue;
      }
      page.drawText(
        [
          "SYNTHETIC - demonstration only",
          title,
          names[Math.floor(i / 2)]!,
          `Original packet position ${i + 1} / 6`,
          `Page ${(i % 2) + 1} of 2`,
          `Name: ${i < 2 ? p.parties.find((p) => p.id === "target")!.legal_name : names[Math.floor(i / 2)]}`,
          i < 2
            ? "Asset purchase price: $1,000,000"
            : "Assets $500,000; liabilities $100,000; net worth $400,000",
          "Date: August 31, 2026",
          "Full signed official statements are supplied separately.",
          "Broker: Morgan Vale, broker@example.com",
          "Signed: Synthetic specimen",
        ].join("\n"),
        { x: 36, y: 740, size: 11, font, lineHeight: 20 },
      );
    }
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }
  switch (d.format) {
    case "docx":
      return docx(p, [d]);
    case "xlsx":
      return xlsx(p, [d]);
    case "scan_pdf": {
      const scan = await demoRaster(p, d);
      const folder = `${root}/${caseId}/${d.batch === 1 ? "photos" : "corrections/photos"}`;
      fs.mkdirSync(folder, { recursive: true });
      for (const [i, png] of scan.images.entries())
        fs.writeFileSync(`${folder}/IMG_${i + 1}.png`, png);
      return scan.bytes;
    }
    case "protected_pdf":
      return protectedPdf(p, [d]);
    default:
      return textPdf(p, [d], d.format === "acroform_pdf");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
