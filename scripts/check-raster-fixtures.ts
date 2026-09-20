// Proof only: independent OCR watermark check and same-host repeat raster observation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { plans } from "../fixtures/lib/plans";
import { groups, documents } from "../fixtures/lib/truth";
import { rasterPdf, textPdf } from "../fixtures/lib/render";
import { hash } from "../fixtures/lib/verify";
import { PDFDocument } from "pdf-lib";
import { officialForm, officialFieldName } from "../src/lib/config/official-form-fields";
async function main() {
  let pages = 0,
    files = 0;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "acqfile-raster-proof-"));
  try {
    for (const p of plans())
      for (const g of groups(p).filter(
        (g) => g.docs[0]!.format === "scan_pdf" && !g.docs[0]!.duplicate_of,
      )) {
        const canonical = fs.readFileSync(path.join("fixtures/deals", p.id, g.file));
        const first = await rasterPdf(p, g.docs),
          second = await rasterPdf(p, g.docs);
        assert.equal(hash(first), hash(second), "Same-host raster regeneration differs");
        assert.equal(
          hash(first),
          hash(canonical),
          "Canonical raster no longer matches current renderer",
        );
        files++;
        const file = path.join(temp, "scan.pdf");
        fs.writeFileSync(file, canonical);
        execFileSync("pdftoppm", ["-png", "-r", "120", file, path.join(temp, "page")]);
        for (const image of fs.readdirSync(temp).filter((f) => /^page-\d+\.png$/.test(f))) {
          const text = execFileSync(
            "tesseract",
            [path.join(temp, image), "stdout", "--psm", "11"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
          );
          assert.match(text, /SYNTHETIC/, `${g.file}/${image}: OCR watermark absent`);
          pages++;
          fs.rmSync(path.join(temp, image));
        }
        // Verify the exact text source sent to the rasterizer, without the application's parser.
        const source = await textPdf(p, g.docs);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = pdfjs.getDocument({ data: new Uint8Array(source), verbosity: 0 });
        const pdf = await task.promise;
        const record = documents(p).find((d) => d.file === g.file)!;
        const official = officialForm(g.docs[0]!.type) && g.docs.length === 1;
        const form = official ? (await PDFDocument.load(source)).getForm() : null;
        for (let i = 1; i <= pdf.numPages; i++) {
          const text = (await (await pdf.getPage(i)).getTextContent()).items
            .map((x) => ("str" in x ? x.str : ""))
            .join(" ");
          assert.ok(text.includes("SYNTHETIC"));
          for (const fact of record.facts.filter((f) => f.locator.page === i)) {
            assert.equal(fact.locator.verbatim, false, "A36: vision facts are not verbatim");
            if (form) {
              const name = officialFieldName(g.docs[0]!.type, fact.attribute)!;
              assert.equal(
                form.getTextField(name).getText(),
                fact.attribute === "ownership.members"
                  ? (fact.value as { name: string }[])[0]!.name
                  : fact.locator.quote,
                `${g.file}: raster source field ${name}`,
              );
            } else
              assert.ok(
                text.replace(/\s+/g, " ").includes(fact.locator.quote.replace(/\s+/g, " ")),
                `${g.file}: raster source value missing`,
              );
          }
        }
        await task.destroy();
      }
    console.log(
      `PASS: ${files} canonical scan files / ${pages} pages; all OCR watermarks; two rerasterizations per file identical on this host. Cross-machine identity not established.`,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
