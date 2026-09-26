import { describe, expect, it } from "vitest";
import {
  attributeName,
  documentName,
  factValue,
  findingHeadline,
  STATUS_MEANING,
} from "@/lib/staff/labels";
import { draftItems } from "@/lib/deliverables/requests";
import type { Rule } from "@/lib/rules/schema";

const rule = (over: Partial<Rule> = {}) =>
  ({ id: "ENT-01", title: "Borrower information form", accepts: ["SBA_1919"], ...over }) as Rule;
const finding = (over: Record<string, unknown> = {}) =>
  ({
    ruleId: "ENT-01",
    type: "incomplete",
    severity: "blocker",
    scopeKey: "buyer",
    period: null,
    detailsJson: { message: "fail: Signature and date are present", details: [] },
    ...over,
  }) as never;

describe("operator vocabulary", () => {
  it("names document types instead of shouting enums", () => {
    expect(documentName("FIN_YEAR_END")).toBe("Year-end financial statements");
    expect(documentName("SBA_1919")).toBe("SBA Form 1919");
    // An unmapped code degrades to sentence case rather than leaking the enum.
    expect(documentName("SOME_NEW_TYPE")).toBe("Some new type");
  });

  it("turns engine messages into headlines an operator can read", () => {
    expect(findingHeadline("incomplete", "fail: Signature and date are present")).toBe(
      "Could not confirm that signature and date are present",
    );
    // Avoids guessing singular or plural for the document name.
    expect(findingHeadline("missing", "Missing: Formation documents")).toBe(
      "Not on file: Formation documents",
    );
    expect(findingHeadline("info", "latest year on extension")).toBe("Latest year on extension");
    expect(findingHeadline("missing", "")).toBe("Finding");
  });

  it("formats values by their own unit and keeps identifiers masked", () => {
    expect(factValue("deal.purchase_price", "USD", 850000)).toBe("$850,000.00");
    expect(factValue("note.rate", "percent", 6)).toBe("6%");
    expect(factValue("note.term_months", "months", 1)).toBe("1 month");
    expect(
      factValue("party.identifier", "masked_identifier", {
        hmac: "a".repeat(64),
        last_four: "4567",
      }),
    ).toBe("••••4567");
    // Segment metadata reads as pairs, and internal ids never surface.
    expect(factValue("", "text", { signed: true, party_id: "uuid-here", period: "2024" })).toBe(
      "signed Yes · period 2024",
    );
  });

  it("explains every checklist status it can render", () => {
    for (const s of ["satisfied", "missing", "not_applicable", "waived", "needs_review"])
      expect(STATUS_MEANING[s]).toBeTruthy();
    expect(attributeName("pfs.total_assets")).toBe("Personal financial statement · Total assets");
  });
});

describe("follow-up drafts are written for the recipient", () => {
  const rules = new Map([["ENT-01", rule()]]);
  const party = () => "Ostrelyva Acquisition LLC";
  const doc = (_v: string, page: number | null) => `SBA Form 1919, page ${page}`;

  it("does not describe a lease-horizon check as two conflicting values", () => {
    const items = draftItems(
      [
        finding({
          type: "conflict",
          detailsJson: { message: "Lease and options cover the review horizon", details: [] },
        }),
      ],
      new Map([
        [
          "ENT-01",
          rule({
            accepts: ["LEASE"],
            checks: [
              {
                type: "date_order",
                message: "Lease and options cover the review horizon",
                expr: true,
              },
            ],
          }),
        ],
      ]),
      party,
      doc,
    );
    expect(items[0]!.ask).toContain("check the lease");
    expect(items[0]!.ask).not.toContain("which value");
    expect(items[0]!.because).toContain("could not confirm that lease and options cover");
  });

  it("never leaks rule parameters, paths, enums or a null page", () => {
    const items = draftItems(
      [
        finding({
          detailsJson: {
            message: "fail: Signature and date are present",
            details: [
              {
                fact_id: null,
                value: { cash_tolerance: 1, form_1919_revision: "02/2025" },
                file: "Declared deal profile",
                page: null,
                quote: "Operator-declared profile; rule parameters: {...}",
              },
            ],
          },
        }),
      ],
      rules,
      party,
      doc,
    );
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/page null/);
    expect(text).not.toMatch(/cash_tolerance|rule parameters/);
    expect(text).not.toMatch(/Buyer\/Attachments|Seller\/Fwd/);
    expect(text).not.toMatch(/\bincomplete\b|\bblocker\b/);
    expect(items[0]!.ask).toBe(
      "Please send a complete SBA Form 1919 for Ostrelyva Acquisition LLC.",
    );
    expect(items[0]!.because).toBe(
      "We have a copy, but we could not confirm that signature and date are present.",
    );
  });

  it("asks for a missing document by name, period and party", () => {
    const items = draftItems(
      [
        finding({
          type: "missing",
          period: "2024",
          detailsJson: { message: "Missing: Personal federal tax return", details: [] },
        }),
      ],
      new Map([["ENT-01", rule({ accepts: ["TAX_PERSONAL"] })]]),
      () => "Providenci Glover",
      doc,
    );
    expect(items[0]!.ask).toBe("Please send the 2024 personal tax return for Providenci Glover.");
    expect(items[0]!.sides).toEqual([]);
  });

  it("shows both sides of a conflict and asks which is correct, never which is right", () => {
    const items = draftItems(
      [
        finding({
          type: "conflict",
          detailsJson: {
            message: "Values agree across the named sources",
            details: [
              { fact_id: "a", value: 2400000, file: "v1", page: 2, quote: "price" },
              { fact_id: "b", value: 2425000, file: "v2", page: 3, quote: "price" },
            ],
          },
        }),
      ],
      rules,
      party,
      doc,
    );
    expect(items[0]!.ask).toMatch(/which value is correct/i);
    expect(items[0]!.sides).toHaveLength(2);
    expect(items[0]!.ask).not.toMatch(/should be|is right|use the/i);
  });
});

it("keeps technical messages out of the actual outgoing draft", () => {
  const items = draftItems(
    [
      finding({
        detailsJson: {
          message: 'unknown: source_account_last_four; rule parameters {"limit": 1}',
          details: [],
        },
      }),
    ],
    new Map([["ENT-01", rule()]]),
    () => "Synthetic party",
    () => "Document",
  );
  expect(items[0]!.because).not.toMatch(/source_account|parameters|unknown:|[{}]/);
});
