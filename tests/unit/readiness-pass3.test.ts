import { expect, it } from "vitest";
import { loadPack } from "@/lib/rules/loader";
import { preparationReadiness } from "@/lib/deliverables/readiness";
import type { IndexRow } from "@/lib/deliverables/index-build";
import type { Rule } from "@/lib/rules/schema";

const pack = loadPack("sop-50-10-8");
const row = (id: string, status: string) =>
  ({ item_id: id, item: id, party: "Buyer", period: "", status }) as IndexRow;
function sample() {
  return {
    index: [row("TXN-01", "satisfied"), row("LND-01", "tracking")],
    rules: new Map([...pack.items, ...pack.consistency].map((r) => [r.id, structuredClone(r)])),
    findings: [] as { ruleId: string; status: string; type: string; severity: string }[],
    current: true,
  };
}
it("excludes only explicitly deferred work, retaining its outstanding status", () => {
  const input = sample();
  const result = preparationReadiness(input);
  expect(result).toMatchObject({
    ready: true,
    applicable: 1,
    satisfied: 1,
    waived: 0,
    policy: "Illustrative checklist, awaiting lender review",
  });
  expect(result.later).toEqual([
    expect.objectContaining({ item: "LND-01", status: "tracking", responsible: "lender" }),
  ]);
  input.rules.get("LND-01")!.submission_stage = "preparation";
  expect(preparationReadiness(input)).toMatchObject({ ready: false, applicable: 2 });
});
it.each(["missing", "needs_review", "received_with_issues"])(
  "blocks a preparation row that is %s",
  (status) => {
    const input = sample();
    input.index[0]!.status = status;
    expect(preparationReadiness(input).ready).toBe(false);
  },
);
it("blocks material conflicts, pending review, stale evaluation and unknown policy", () => {
  const input = sample();
  input.findings.push({ ruleId: "CON-03", status: "open", type: "conflict", severity: "major" });
  expect(preparationReadiness(input).ready).toBe(false);
  input.findings[0]!.status = "resolved";
  expect(preparationReadiness(input).ready).toBe(true);
  expect(preparationReadiness({ ...input, current: false }).ready).toBe(false);
  expect(
    preparationReadiness({ ...input, reviewIssues: ["Required amount awaiting review"] }).ready,
  ).toBe(false);
  delete input.rules.get("LND-01")!.submission_stage;
  expect(preparationReadiness(input).ready).toBe(false);
  input.rules.get("LND-01")!.submission_stage = "later_lender";
  input.rules.get("LND-01")!.responsible = "unknown";
  expect(preparationReadiness(input).ready).toBe(false);
  input.rules.set("CON-99", { responsible: "buyer" } as Rule);
  input.findings.push({ ruleId: "CON-99", status: "open", type: "needs_review", severity: "info" });
  expect(preparationReadiness(input).ready).toBe(false);
});
it("keeps waived and not-applicable outcomes distinct", () => {
  const input = sample();
  input.index[0]!.status = "waived";
  input.index.push(row("TGT-01", "not_applicable"));
  expect(preparationReadiness(input)).toMatchObject({
    ready: true,
    satisfied: 0,
    waived: 1,
    notApplicable: 1,
    applicable: 1,
  });
});

it("requires assignment when the actual provider is unknown despite a default rule owner", () => {
  const input = sample();
  input.index[0]!.responsible = "Unassigned — needs assignment";
  expect(preparationReadiness(input).ready).toBe(false);
});
