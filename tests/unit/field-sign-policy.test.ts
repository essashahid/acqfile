import { expect, it } from "vitest";
import { FACTS } from "@/lib/domain/registry";
import { parseNumber } from "@/lib/extract/parse-value";
import { validateCandidates } from "@/lib/extract/validate";
import { score } from "@/lib/extract/confidence";
import type { Candidate } from "@/lib/extract/candidate";

const candidate = (attribute: string, value: unknown): Candidate => ({
  attribute,
  value,
  method: "acroform",
  mapped: true,
  raw: null,
  source_block_ids: [],
  quote: null,
  page: 1,
  region: null,
  ambiguity: null,
});
const validation = (attribute: string, value: unknown) =>
  validateCandidates([candidate(attribute, value)], [], 1, 1)[0]!;

it("keeps accounting and leading minus signs while validating by fact", () => {
  expect(parseNumber("($25,000)")).toBe(-25000);
  expect(parseNumber("-25,000")).toBe(-25000);
  for (const attribute of [
    "deal.purchase_price",
    "deal.loan_requested",
    "deal.seller_note_amount",
    "funding.sources_total",
    "funding.uses_total",
    "pfs.cash",
    "pfs.total_assets",
    "pfs.total_liabilities",
    "aging.total",
    "debt.total",
    "note.principal",
    "gift.amount",
    "agent.amount",
    "report.concluded_value",
    "tax.gross_receipts",
    "financial.revenue",
    "financial.total_assets",
    "financial.total_liabilities",
  ]) {
    expect(FACTS[attribute]!.nonnegative).toBe(true);
    expect(validation(attribute, -25000)).toMatchObject({
      score: 0,
      messages: [{ code: "negative_not_allowed", level: "error" }],
    });
    expect(validation(attribute, 0).score).toBe(1);
  }
  const extracted = candidate("deal.purchase_price", -25000);
  const invalid = validation(extracted.attribute, extracted.value);
  expect(score(extracted, invalid, null).routing).toBe("review");
  expect(invalid.score > 0).toBe(false);
});

it("rejects negative funding and debt entries while allowing signed accounting values", () => {
  for (const attribute of ["funding.sources", "funding.uses"]) {
    expect(validation(attribute, [{ label: "Cash", amount: -1 }]).messages).toContainEqual({
      code: "negative_not_allowed",
      level: "error",
    });
    expect(validation(attribute, [{ label: "Cash", amount: 0 }]).score).toBe(1);
  }
  for (const value of [
    [{ creditor: "Bank", balance: -1, payment: 0 }],
    [{ creditor: "Bank", balance: 0, payment: -1 }],
  ])
    expect(validation("debt.debts", value).messages).toContainEqual({
      code: "negative_not_allowed",
      level: "error",
    });
  for (const attribute of [
    "tax.net_income",
    "financial.net_income",
    "pfs.net_worth",
    "bank.ending_balance",
  ]) {
    expect(FACTS[attribute]!.nonnegative).toBe(false);
    expect(validation(attribute, -25000).score).toBe(1);
  }
});
