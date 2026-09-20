import { describe, it, expect } from "vitest";
import { mapDeal, personHome, type Data, type ResponseRow } from "@/lib/portal/map";
import { customerBanned } from "@/lib/portal/copy";
import { loadPack } from "@/lib/rules/loader";
import type { IndexRow } from "@/lib/deliverables/index-build";
const pack = loadPack("sop-50-10-8");
function data(rows: Partial<IndexRow>[]): Data {
  return {
    deal: { profileJson: { equity_sources: [] } },
    parties: [
      {
        id: "buyer",
        legalName: "Kiel McDermott",
        kind: "individual",
        roles: ["buyer_owner", "guarantor"],
      },
    ],
    rules: new Map([...pack.items, ...pack.consistency].map((r) => [r.id, r])),
    index: rows.map((r) => ({
      item_id: "GUA-02",
      scope_key: "buyer",
      period: "",
      checks: [],
      segments: [],
      ...r,
    })),
    findings: [],
    versions: [],
    facts: [],
    segments: [],
  } as unknown as Data;
}
describe("customer mapping", () => {
  it("several document checks become one ask, with signature before age", () => {
    const d = data([
      {
        status: "received_with_issues",
        checks: [
          { type: "freshness", result: "fail", message: "" },
          { type: "signed_and_dated", result: "fail", message: "" },
        ],
      },
    ]);
    const m = mapDeal(d);
    expect(m.tasks).toHaveLength(1);
    expect(m.tasks[0]!.sentence).toContain("sign and date");
    expect(personHome(m, "buyer", "Kiel McDermott").state).toBe("todo");
  });
  it("not-applicable and lender tracking never reach a person", () => {
    const tracking = pack.items.find((r) => r.checks.some((c) => c.type === "tracking"))!;
    expect(
      mapDeal(data([{ status: "not_applicable" }, { item_id: tracking.id, status: "missing" }]))
        .tasks,
    ).toHaveLength(0);
  });
  it("waiting and done are derived, and a can't-send answer never completes a missing row", () => {
    const d = data([{ status: "missing" }]);
    const key = mapDeal(d).tasks[0]!.key;
    const response = {
      taskKey: key,
      kind: "cant_send",
      payload: { reason: "not_applicable" },
      createdAt: new Date(),
    } as unknown as ResponseRow;
    expect(mapDeal(d, [response]).tasks[0]!.state).toBe("To do");
    expect(personHome(mapDeal(data([{ status: "needs_review" }])), "buyer", "Kiel").state).toBe(
      "waiting",
    );
    expect(personHome(mapDeal(data([{ status: "satisfied" }])), "buyer", "Kiel").state).toBe(
      "done",
    );
  });
  it("three prices yield exactly three choices and one adviser question", () => {
    const d = data([]);
    d.findings = [
      {
        findingKey: "price",
        ruleId: "CON-03",
        scopeKey: "deal",
        status: "open",
        type: "conflict",
        detailsJson: {
          details: [2400000, 2410000, 2425000]
            .map((value, i) => ({
              fact_id: "f" + i,
              value,
              file: "v",
              page: 1,
              quote: String(value),
            }))
            .concat([
              { fact_id: null, value: { purchase_price: 2400000 }, page: null },
              { fact_id: null, value: { metadata: true }, page: 1 },
            ] as never),
        },
      },
    ] as unknown as Data["findings"];
    const m = mapDeal(d);
    expect(m.questions).toHaveLength(1);
    expect(m.questions[0]!.values).toEqual(["2,400,000", "2,410,000", "2,425,000"]);
    expect(m.questions[0]!.partyId).toBeNull();
    expect(personHome(m, "buyer", "Kiel").questions).toHaveLength(0);
  });
  it.each([
    "error",
    "invalid",
    "failed",
    "rejected",
    "flag",
    "exception",
    "conflict",
    "mismatch",
    "stale",
    "request",
    "package",
    "checklist item",
    "finding",
    "needs_review",
    "received_with_issues",
    "segment",
    "attestation",
    "evaluation",
    "overlay",
    "snapshot",
    "hash",
    "sha",
    "acroform",
    "vision",
    "idempotent",
    "confidence",
    "eligible",
    "ineligible",
    "qualifies",
    "compliant",
    "meets SBA requirements",
    "approved",
    "pre-approved",
    "accepted by the lender",
    "on track",
  ])("rejects customer word %s", (word) => expect(customerBanned.test(word)).toBe(true));
});

function luminance(hex: string) {
  return hex
    .match(/\w\w/g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((n, x, i) => n + x * [0.2126, 0.7152, 0.0722][i]!, 0);
}
it("every prescribed body, muted and accent palette pair exceeds 4.5:1", () => {
  for (const [ink, paper] of [
    ["14202B", "F7F6F2"],
    ["2C3A47", "F7F6F2"],
    ["5A6875", "F0EEE8"],
    ["5A6875", "FFFFFF"],
    ["12355B", "FFFFFF"],
    ["8A5A00", "FBF3DF"],
    ["1E6B45", "E8F3EC"],
  ])
    expect((luminance(paper!) + 0.05) / (luminance(ink!) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
