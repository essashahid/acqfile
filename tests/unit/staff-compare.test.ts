import { describe, expect, it } from "vitest";
import { loadPack } from "@/lib/rules/loader";
import { checksFromMessage, explainItem } from "@/lib/staff/explain";
import { comparisonLine, comparisonSentence, comparisonSides } from "@/lib/staff/compare";

const pack = loadPack("sop-50-10-8");
const rules = new Map([...pack.items, ...pack.consistency].map((r) => [r.id, r]));
const rule = (id: string) => rules.get(id)!;
const profile = {
  fact_id: null,
  file: "Declared deal profile",
  page: null,
  quote: "Operator-declared profile",
  value: { structure: "asset", premises: "leased" },
};
const ctx = {
  segments: [
    { documentVersionId: "pa", pageStart: 1, pageEnd: 1, docType: "PURCHASE_AGREEMENT" },
    { documentVersionId: "tax-23", pageStart: 1, pageEnd: 1, docType: "TAX_BUSINESS" },
    { documentVersionId: "tax-24", pageStart: 1, pageEnd: 1, docType: "TAX_BUSINESS" },
    { documentVersionId: "lease", pageStart: 1, pageEnd: 1, docType: "LEASE" },
  ],
  facts: [
    { id: "f-structure", attribute: "deal.structure", unit: "text", valueJson: "stock" },
    {
      id: "f-a1",
      attribute: "party.address",
      unit: "text",
      valueJson: "14 Velnoric Way, Tazmervale, ZZ 00000",
    },
    {
      id: "f-a2",
      attribute: "party.address",
      unit: "text",
      valueJson: "28 Velnoric Way, Tazmervale, ZZ 00000",
    },
    {
      id: "f-a3",
      attribute: "party.address",
      unit: "text",
      valueJson: "14 Velnoric Way, Tazmervale, ZZ 00000",
    },
    { id: "f-exp", attribute: "lease.expiry", unit: "date", valueJson: "2029-09-30" },
    { id: "f-opt", attribute: "lease.option_years", unit: "years", valueJson: 5 },
  ],
  versions: [
    { id: "pa", sourceFilename: "attachment-2.pdf" },
    { id: "tax-23", sourceFilename: "attachment-23.pdf" },
    { id: "tax-24", sourceFilename: "attachment-24.pdf" },
    { id: "lease", sourceFilename: "scan0007.pdf" },
  ],
  parameters: pack.parameters,
};

describe("both sides of a disagreement come from what the finding recorded", () => {
  it("puts the declared profile beside the signed document, with its quote and page", () => {
    const sides = comparisonSides(
      rule("CON-11"),
      [
        {
          fact_id: "f-structure",
          file: "pa",
          page: 1,
          quote:
            "all of the issued and outstanding equity interests of the Company (a stock purchase)",
          value: "stock",
        },
        {
          fact_id: null,
          file: "pa",
          page: 1,
          quote: "Signature: e-signed; Date: 08/31/2026",
          value: { signed: true, signature_date: "2026-08-31" },
        },
        profile,
      ],
      ctx,
    );
    expect(sides.map((s) => [s.source, s.label, s.value])).toEqual([
      ["profile", "Deal profile", "Asset purchase"],
      ["document", "Purchase agreement", "Stock purchase"],
    ]);
    expect(sides[1]).toMatchObject({ page: 1, filename: "attachment-2.pdf" });
    expect(sides[1]!.signed).toMatch(/^E-signed 31 Aug/);
    expect(comparisonLine(sides)).toBe(
      "Profile: Asset purchase · Purchase agreement p.1: Stock purchase",
    );
    expect(comparisonSentence(sides)).toBe(
      "The deal profile says asset purchase. The purchase agreement says stock purchase.",
    );
  });

  it("names each value once when several documents read the same field", () => {
    const sides = comparisonSides(
      rule("CON-12"),
      [
        {
          fact_id: "f-a1",
          file: "tax-23",
          page: 1,
          quote: "14 Velnoric Way",
          value: "14velnoricwaytazmervalezz00000",
        },
        {
          fact_id: "f-a2",
          file: "pa",
          page: 1,
          quote: "28 Velnoric Way",
          value: "28velnoricwaytazmervalezz00000",
        },
        {
          fact_id: "f-a3",
          file: "tax-24",
          page: 1,
          quote: "14 Velnoric Way",
          value: "14velnoricwaytazmervalezz00000",
        },
        profile,
      ],
      ctx,
    );
    // The stored normalised copy is shown in the fact's own words.
    expect(sides.every((s) => s.value.includes("Velnoric Way"))).toBe(true);
    expect(comparisonLine(sides)).toBe(
      "Purchase agreement: 28 Velnoric Way · Business tax return (2): 14 Velnoric Way",
    );
  });

  it("states a configured span as what the lease needs, not as a document value", () => {
    const sides = comparisonSides(
      rule("CON-13"),
      [
        {
          fact_id: "f-opt",
          file: "lease",
          page: 1,
          quote: "Renewal option term (years) 5",
          value: 5,
        },
        {
          fact_id: "f-exp",
          file: "lease",
          page: 1,
          quote: "Expiration Date September 30, 2029",
          value: "2029-09-30",
        },
        profile,
      ],
      ctx,
    );
    const limit = sides.find((s) => s.source === "limit");
    expect(limit).toMatchObject({ label: "needs", value: "10 years" });
    expect(comparisonLine(sides)).toMatch(/^Lease p\.1: .*expiry .*2029.* · needs 10 years$/);
  });

  it("returns no sides for a rule without comparable operands", () => {
    expect(comparisonSides(rule("TXN-06"), [profile], ctx)).toEqual([]);
    expect(comparisonLine([])).toBe("");
  });
});

describe("a work-list row says the point in a few words", () => {
  it("reads a consistency finding from its own message when there is no requirement row", () => {
    const message = "fail: Declared and document structures agree";
    const ex = explainItem({
      rule: rule("CON-11"),
      status: "needs_review",
      checks: checksFromMessage(rule("CON-11"), message),
      findingType: "conflict",
      findingMessage: message,
      parameters: pack.parameters,
    });
    // Before, an empty check list fell through to "No purchase agreement on file."
    expect(ex.summary).not.toMatch(/^No .* on file/);
    expect(ex.family).toBe("relationship");
    expect(ex.brief).toBe("Sources disagree");
  });

  it("names the unconfirmed field, the manual answer and missing evidence briefly", () => {
    const presence = explainItem({
      rule: rule("TXN-06"),
      status: "needs_review",
      checks: rule("TXN-06").checks.map((c) => ({
        type: c.type,
        result: "unknown",
        message: c.message,
      })),
      parameters: pack.parameters,
    });
    expect(presence.brief).toBe("Term months not confirmed");
    const license = explainItem({
      rule: rule("TGT-09"),
      status: "needs_review",
      checks: rule("TGT-09").checks.map((c, i) => ({
        type: c.type,
        result: i === 0 ? "pass" : "unknown",
        message: c.message,
      })),
      parameters: pack.parameters,
    });
    expect(license.brief).toBe("Seller's personal license? Record the answer");
    const missing = explainItem({
      rule: rule("TGT-07b"),
      status: "missing",
      checks: [],
      findingType: "missing",
      findingMessage: "missing: lease consent",
      parameters: pack.parameters,
    });
    expect(missing.brief).toBe("Not on file");
  });
});
