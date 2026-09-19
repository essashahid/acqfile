import { describe, expect, it } from "vitest";
import { createMockProvider, parseAmounts, parseDates } from "@/lib/llm/mock";

describe("mock provider helpers", () => {
  it("parses money and dates in common phrasings, including '4 Sept. 26'", () => {
    expect(parseAmounts("The revised program cost is $1.25 million.")).toContain(1250000);
    expect(parseAmounts("USD 480,000 was spent")).toContain(480000);
    expect(parseDates("Published 12 March 2026")).toEqual(["2026-03-12"]);
    expect(parseDates("4 Sept. 26")).toEqual(["2026-09-04"]);
    expect(parseDates("March 3, 2026 and 2026-01-09")).toEqual(["2026-01-09", "2026-03-03"]);
  });
  it("verifier is rule based: supports quotes that state the value and rejects missing quotes", async () => {
    const p = createMockProvider();
    const ctx = [{ source_block_id: "L", locator: "page 1", text: "The revised program cost is $1.25 million." }];
    const { outcomes } = await p.verify([
      { fieldPath: "monetary_amounts[0]", fieldDefinition: "", candidateValue: { amount: 1250000, currency: "USD", context: "cost" }, evidence: [{ source_block_id: "L", quote: "The revised program cost is $1.25 million.", found_in_block: true }], context: ctx },
      { fieldPath: "monetary_amounts[0]", fieldDefinition: "", candidateValue: { amount: 999, currency: "USD", context: "cost" }, evidence: [{ source_block_id: "L", quote: "The revised program cost is $1.25 million.", found_in_block: true }], context: ctx },
      { fieldPath: "report_title", fieldDefinition: "", candidateValue: "X", evidence: [{ source_block_id: "L", quote: "nope", found_in_block: false }], context: ctx },
    ]);
    expect(outcomes[0]!.status).toBe("supported");
    expect(outcomes[0]!.evidenceSpecificity).toBe(1);
    expect(outcomes[1]!.status).toBe("partially_supported");
    expect((outcomes[1]!.correctedValue as { amount: number }).amount).toBe(1250000);
    expect(outcomes[1]!.contradictionDetected).toBe(true);
    expect(outcomes[2]!.status).toBe("unsupported");
  });

});
