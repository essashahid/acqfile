import { describe, expect, it } from "vitest";
import { consumption, extractionFields, expectedAttributes } from "@/lib/extract/schema";
import { DOCUMENT_TYPES, FACT_CATALOG, FACTS } from "@/lib/domain/registry";
import { validateCandidates } from "@/lib/extract/validate";
import { score, classificationConfidence } from "@/lib/extract/confidence";
import { decodeModelValue, agreement } from "@/lib/extract/values";
import { EXTRACTOR_SYSTEM_PROMPT, VERIFIER_SYSTEM_PROMPT } from "@/lib/extract/prompts";
import type { Candidate, Validation, Verdict } from "@/lib/extract/candidate";
import type { Source } from "@/lib/deals/parse";
import fs from "node:fs";
const text = (over: Partial<Candidate> = {}): Candidate => ({
  attribute: "deal.purchase_price",
  method: "text",
  value: 2425000,
  raw: "2425000",
  source_block_ids: ["page-1"],
  quote: "purchase price: 2425000",
  region: null,
  ambiguity: null,
  page: 1,
  ...over,
});
const blocks: Source[] = [
  {
    page: 1,
    locator: "page-1",
    text: "Letter of Intent\nName: Buyer\npurchase price: 2425000\nseller: Target LLC",
    kind: "page",
  },
  { page: 2, locator: "page-2", text: "other document", kind: "page" },
];
const ok: Validation = {
  attribute: "deal.purchase_price",
  messages: [],
  score: 1,
  exact: 1,
  locators_ok: true,
};
const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  attribute: "deal.purchase_price",
  status: "supported",
  corrected_value: 2425000,
  contradiction: false,
  specificity: 1,
  reason: "stated",
  ...over,
});
describe("A38 schemas come from the catalog and the packs", () => {
  it("every extraction field is produced by the type and consumed by a shipped rule; nothing else is extracted", () => {
    const consumed = consumption().attributes;
    expect(consumed.size).toBe(42);
    for (const type of DOCUMENT_TYPES)
      for (const f of extractionFields(type)) {
        expect(f.producers).toContain(type);
        expect(consumed.has(f.attribute)).toBe(true);
      }
    const unconsumed = FACT_CATALOG.filter((f) => !consumed.has(f.attribute));
    expect(unconsumed.length).toBeGreaterThan(0);
    for (const f of unconsumed)
      for (const type of DOCUMENT_TYPES)
        expect(extractionFields(type).map((x) => x.attribute)).not.toContain(f.attribute);
  });
  it("includes the buyer and seller names an agreement check reads implicitly", () => {
    expect(extractionFields("LOI").map((f) => f.attribute)).toEqual(
      expect.arrayContaining(["deal.buyer", "deal.seller"]),
    );
    expect(extractionFields("RESUME")).toEqual([]);
    expect(extractionFields("OWNERSHIP_CHART").map((f) => f.attribute)).toEqual([
      "ownership.members",
    ]);
  });
  it("expects sole-producer attributes so a planted missing value becomes a gap", () => {
    expect(expectedAttributes("DEBT_SCHEDULE")).toContain("debt.total");
    expect(expectedAttributes("GIFT_LETTER")).toContain("gift.amount");
    expect(expectedAttributes("LOI")).not.toContain("party.legal_name");
  });
  it("uses the A37 prompts verbatim", () => {
    const phase = fs.readFileSync("docs/PHASE_4.md", "utf8");
    expect(phase).toContain(EXTRACTOR_SYSTEM_PROMPT);
    expect(phase).toContain(VERIFIER_SYSTEM_PROMPT);
  });
});
describe("deterministic validation", () => {
  it("finds the quote in the cited block and flags a quote that is not there", () => {
    const [good] = validateCandidates([text()], blocks, 1, 1);
    expect(good!.exact).toBe(1);
    expect(good!.score).toBe(1);
    const [bad] = validateCandidates([text({ quote: "purchase price: 2452000" })], blocks, 1, 1);
    expect(bad!.exact).toBe(0);
    expect(bad!.messages.map((m) => m.code)).toContain("evidence_quote_not_found");
  });
  it("rejects citations outside the segment or unknown, bad dates, and Form 413 totals that disagree", () => {
    expect(
      validateCandidates([text({ source_block_ids: ["page-2"] })], blocks, 1, 1)[0]!.locators_ok,
    ).toBe(false);
    expect(
      validateCandidates([text({ source_block_ids: ["page-9"] })], blocks, 1, 1)[0]!.locators_ok,
    ).toBe(false);
    expect(
      validateCandidates(
        [text({ attribute: "deal.expiry_date", value: "2026-13-40", quote: "Letter of Intent" })],
        blocks,
        1,
        1,
      )[0]!.messages.map((m) => m.code),
    ).toContain("date_invalid");
    const pfs = ["pfs.total_assets", "pfs.total_liabilities", "pfs.net_worth"].map((attribute, i) =>
      text({ attribute, value: [500000, 100000, 300000][i], quote: "Letter of Intent" }),
    );
    expect(validateCandidates(pfs, blocks, 1, 1)[2]!.messages.map((m) => m.code)).toContain(
      "pfs_totals_disagree",
    );
  });
  it("decodes model shapes: money with currency, last-four identifiers, JSON strings", () => {
    expect(
      decodeModelValue(FACTS["deal.purchase_price"]!, '{"amount":100,"currency":"USD"}').value,
    ).toBe(100);
    expect(
      decodeModelValue(FACTS["deal.purchase_price"]!, '{"amount":100,"currency":"EUR"}').error,
    ).toBe("currency_invalid");
    expect(decodeModelValue(FACTS["party.identifier"]!, '{"last_four":"4321"}').value).toEqual({
      last_four: "4321",
    });
    expect(decodeModelValue(FACTS["deal.expiry_date"]!, '"2026-09-01"').value).toBe("2026-09-01");
    expect(agreement("Varnholt Climate Services, LLC", "varnholt climate services llc")).toBe(1);
    expect(agreement(1300000, 1030000)).toBe(0);
  });
});
describe("A39 confidence and routing computed in code", () => {
  it("text: clean evidence auto-accepts at 1.0", () => {
    const s = score(text(), ok, verdict());
    expect(s.confidence).toBe(1);
    expect(s.routing).toBe("auto_accepted");
  });
  it("text: a contradicted value is blocked regardless of score", () => {
    const s = score(
      text({ value: 2452000 }),
      ok,
      verdict({ status: "unsupported", contradiction: true }),
    );
    expect(s.routing).toBe("blocked");
    expect(s.reasons).toContain("verifier_unsupported");
  });
  it("text: unsupported evidence (quote not in block) is blocked", () => {
    const s = score(
      text(),
      { ...ok, exact: 0, score: 0.5 },
      verdict({ status: "unsupported", corrected_value: null, specificity: 0 }),
    );
    expect(s.routing).toBe("blocked");
    expect(s.reasons).toContain("unsupported_evidence");
  });
  it("text: weak evidence scores 0.815 and reviews; a verifier correction scores 0.70 and reviews", () => {
    const weak = score(text(), ok, verdict({ status: "partially_supported", specificity: 0.4 }));
    expect(weak.confidence).toBe(0.815);
    expect(weak.routing).toBe("review");
    const corrected = score(
      text({ value: 1030000 }),
      ok,
      verdict({ status: "partially_supported", corrected_value: 1300000, specificity: 0.75 }),
    );
    expect(corrected.confidence).toBe(0.7);
    expect(corrected.routing).toBe("review");
  });
  it("vision: agreeing reads score 1.0 but never auto-accept; disagreeing reads score 0.65 and review", () => {
    const agree = score(
      text({ method: "vision", second_read: 2425000, quote: "2425000" }),
      { ...ok, exact: 0 },
      verdict(),
    );
    expect(agree.confidence).toBe(1);
    expect(agree.routing).toBe("review");
    expect(agree.reasons).toContain("vision_never_auto_accepts");
    const disagree = score(
      text({ method: "vision", second_read: 2452000, quote: "2425000" }),
      { ...ok, exact: 0 },
      verdict(),
    );
    expect(disagree.confidence).toBe(0.65);
    expect(disagree.routing).toBe("review");
    expect(
      score(
        text({ method: "vision", second_read: 2452000 }),
        { ...ok, exact: 0 },
        verdict({ specificity: 0.75 }),
      ).routing,
    ).toBe("blocked");
  });
  it("acroform: a mapped field that validates is 1.0 with no model call; a validation failure reviews", () => {
    expect(score(text({ method: "acroform", mapped: true }), ok, null)).toMatchObject({
      confidence: 1,
      routing: "auto_accepted",
    });
    expect(
      score(text({ method: "acroform", mapped: true }), { ...ok, score: 0.5 }, null).routing,
    ).toBe("review");
  });
  it("classification confidence is code-computed", () => {
    expect(
      classificationConfidence({
        deterministic: true,
        cueAgrees: null,
        quoteFound: false,
        uncertain: true,
      }),
    ).toBe(1);
    expect(
      classificationConfidence({
        deterministic: false,
        cueAgrees: true,
        quoteFound: true,
        uncertain: false,
      }),
    ).toBe(1);
    expect(
      classificationConfidence({
        deterministic: false,
        cueAgrees: false,
        quoteFound: true,
        uncertain: true,
      }),
    ).toBe(0.4);
  });
});
