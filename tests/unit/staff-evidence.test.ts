import { expect, it } from "vitest";
import { requirementEvidence } from "@/lib/staff/evidence";
import type { dealView } from "@/lib/staff/deal-view";
import type { IndexRow } from "@/lib/deliverables/index-build";
it("links only the matching party, period and source account without satisfying the requirement", () => {
  const row = {
    item_id: "GUA-07",
    scope_key: "source",
    period: "2026-08",
    status: "received_with_issues",
    segments: [],
  } as unknown as IndexRow;
  const segment = {
    id: "matching",
    docType: "BANK_STATEMENT",
    partyId: "person",
    period: "2026-08",
    accountLastFour: "1234",
    documentVersionId: "file",
    pageStart: 1,
  };
  const v = {
    rules: new Map([["GUA-07", { accepts: ["BANK_STATEMENT"] }]]),
    deal: {
      profileJson: {
        equity_sources: [{ id: "source", party: "person", source_account_last_four: "1234" }],
      },
    },
    parties: [{ id: "person" }],
    segments: [
      segment,
      { ...segment, id: "wrong-party", partyId: "other" },
      { ...segment, id: "wrong-year", period: "2025-08" },
      { ...segment, id: "wrong-account", accountLastFour: "4321" },
    ],
  } as unknown as Awaited<ReturnType<typeof dealView>>;
  expect(requirementEvidence(v, row).map((s) => s.id)).toEqual(["matching"]);
  expect(row.status).toBe("received_with_issues");
  expect(row.segments).toEqual([]);
  expect(requirementEvidence(v, { ...row, status: "not_applicable" })).toEqual([]);
});
