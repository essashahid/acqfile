// Fixture authoring only. Uses PDF.js's installed node canvas dependency; never imported by runtime.
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import { FIXED_DATE, textPdf } from "../lib/render";
import type { Doc, Plan } from "../plans/shared";
const require = createRequire(import.meta.url);
const canvas = createRequire(require.resolve("pdfjs-dist/package.json"))("@napi-rs/canvas") as {
  createCanvas(
    width: number,
    height: number,
  ): { getContext(kind: string): unknown; toBuffer(kind: string): Buffer };
};
export async function demoRaster(p: Plan, d: Doc) {
  const source = await PDFDocument.load(await textPdf(p, [d]));
  source.getForm().flatten();
  return rasterBytes(Buffer.from(await source.save()));
}
export async function rasterBytes(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0, useSystemFonts: true });
  const pdf = await task.promise;
  const result = await PDFDocument.create();
  result.setCreationDate(FIXED_DATE);
  result.setModificationDate(FIXED_DATE);
  const images: Buffer[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        view = page.getViewport({ scale: 1.4 });
      const surface = canvas.createCanvas(Math.ceil(view.width), Math.ceil(view.height));
      await page.render({
        canvasContext: surface.getContext("2d") as CanvasRenderingContext2D,
        viewport: view,
        canvas: null,
      }).promise;
      const png = surface.toBuffer("image/png");
      images.push(png);
      const image = await result.embedPng(png);
      result.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    }
    return { bytes: Buffer.from(await result.save({ useObjectStreams: false })), images };
  } finally {
    await task.destroy();
  }
}
