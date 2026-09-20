import { PDFDocument } from "pdf-lib";
import { estimateCostUsd } from "@/lib/config";
/** Optional evaluation-only budget. Reservations remain charged on failed/ambiguous calls. */
let remaining: number | null = null;
export function startLiveBudget(cap = 5) {
  remaining = cap;
}
export async function reserveLiveCall(
  model: string,
  text: string,
  pdf: Buffer | null,
  outputCap: number,
) {
  if (remaining === null) return;
  const pages = pdf ? (await PDFDocument.load(pdf)).getPageCount() : 0;
  // Conservative for this fixed synthetic corpus: a byte per text token, encoded PDF bytes,
  // 32K image tokens per page, plus schema/system overhead. Never refund reservations.
  const inputUpperBound =
    Buffer.byteLength(text) + (pdf ? Math.ceil((pdf.length * 4) / 3) : 0) + pages * 32768 + 16384;
  const reserve = estimateCostUsd(model, inputUpperBound, outputCap);
  if (reserve > remaining)
    throw Error("Live evaluation USD 5 budget exhausted before provider call");
  remaining -= reserve;
}
