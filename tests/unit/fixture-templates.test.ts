import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { deterministicSegments } from "@/lib/deals/classification";
import { parseArrival } from "@/lib/deals/parse";
import { comparable } from "@/lib/extract/mock";
import { normalizeText } from "@/lib/text";
import { plans } from "../../fixtures/lib/plans";
import { documents } from "../../fixtures/lib/truth";
import { factQuote, isIrs, templateOps } from "../../fixtures/lib/doc";
const key = "SYNTHETIC-TEMPLATE-TEST-HMAC-KEY-ONLY";

describe("realistic fixture documents (A98)", () => {
  it("compares printed amounts and dates as a reader would", () => {
    const states = (quote: string, value: string) => comparable(quote).includes(comparable(value));
    expect(states("Total uses $3,700,000", "3700000")).toBe(true);
    expect(states("Total uses $3,700,000", "370000")).toBe(true); // substring, as before
    expect(states("Ending balance on July 31, 2026 $180,000.00", "180000")).toBe(true);
    expect(states("Aged as of April 18, 2026", "2026-04-18")).toBe(true);
    expect(states("4b EXP 12/31/2030", "2030-12-31")).toBe(true);
    expect(states("Aged as of April 19, 2026", "2026-04-18")).toBe(false);
  });

  it("recognises an official IRS page despite the spacing PDF extraction inserts", async () => {
    const parsed = await parseArrival(fs.readFileSync("fixtures/forms/irs/4506c-2022.pdf"), key);
    const page = parsed.blocks.find((b) => b.kind === "page")!.text;
    expect(page).toMatch(/Form\s{2,}4506-C/);
    expect(deterministicSegments(parsed)?.[0]?.doc_type).toBe("IRS_4506C");
  });

  it("draws every authored fact on its document exactly as truth cites it", async () => {
    for (const p of plans())
      for (const d of p.documents) {
        // Official SBA forms state their values in AcroForm fields, not in template wording.
        if (["SBA_1919", "SBA_413"].includes(d.type)) continue;
        for (const attribute of Object.keys(d.facts))
          expect(() => factQuote(d, attribute), `${d.id}/${attribute}`).not.toThrow();
        // templateOps fails if any stated quote is missing from the drawn page.
        if (!isIrs(d)) await templateOps(p, d);
      }
  });

  it("keeps planted faults honest: real quotes are on the page, invented ones are not", async () => {
    let checked = 0;
    for (const p of plans()) {
      const truth = documents(p);
      for (const f of p.faults) {
        const d = p.documents.find((x) => x.id === f.document)!;
        const record = truth.find((t) => t.segments.some((s) => s.id === d.id));
        if (!f.extractor.quote || !record || d.format === "scan_pdf" || d.format === "xlsx")
          continue;
        const parsed = await parseArrival(
          fs.readFileSync(`fixtures/deals/${p.id}/${record.file}`),
          key,
        );
        const segment = record.segments.find((s) => s.id === d.id)!;
        const text = normalizeText(
          parsed.blocks
            .filter((b) => b.page >= segment.page_start && b.page <= segment.page_end)
            .map((b) => b.text)
            .join(" "),
        );
        const present = text.includes(normalizeText(f.extractor.quote));
        expect(present, `${p.id}/${f.id} ${f.kind}: ${f.extractor.quote}`).toBe(
          f.kind !== "quote_not_in_block",
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(7);
  });
});
