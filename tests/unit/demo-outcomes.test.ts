import { expect, it } from "vitest";
import { evaluateDeal } from "@/lib/rules/engine";
import { loadPack } from "@/lib/rules/loader";
import { casePlan } from "../../fixtures/demo/plans";
import { engineInput } from "../../fixtures/lib/truth";
import type { DemoCaseId } from "@/lib/demo/registry";
function outcomes(id: DemoCaseId, batch: number) {
  const p = casePlan(id);
  // Simulated reviewed evidence for a pure rule oracle, not a database seed or correction workflow.
  // The unrelated D02 return is explicitly excluded after staff review.
  if (id === "D02") p.documents = p.documents.filter((d) => !(batch === 2 && d.id === "unrelated"));
  if (id === "D03") p.documents = p.documents.filter((d) => d.id !== "pfs");
  return evaluateDeal(engineInput(p, batch), loadPack(p.pack));
}
it("clean, photo replacement and protected-file replacement have no invented blockers after required review", () => {
  for (const [id, batch] of [
    ["D01", 1],
    ["D03", 2],
    ["D04", 2],
    ["D07", 2],
    ["D08", 1],
  ] as const)
    expect(outcomes(id, batch).findings, id).toEqual([]);
});
it("wrong periods remain missing; existing correct periods and duplicates do not add obligations", () => {
  const first = outcomes("D02", 1);
  expect(first.findings.map((f) => [f.rule_id, f.scope_key, f.period]).sort()).toEqual([
    ["CON-16", "deal", null],
    ["GUA-02", "alex", "2025"],
    ["GUA-07", "cash-alex", "2026-08"],
  ]);
  expect(outcomes("D02", 2).findings).toEqual([]);
});
it("unknown signature and unreadable formation source need review/replacement", () => {
  expect(
    outcomes("D04", 1).checklist.find((r) => r.item_id === "GUA-01" && r.scope_key === "alex")
      ?.status,
  ).toBe("needs_review");
  expect(outcomes("D07", 1).checklist.find((r) => r.item_id === "ENT-02")?.status).toBe("missing");
});
it("D05 raises the authored structure, address, consulting and lease issues", () => {
  expect(outcomes("D05", 1).findings.map((f) => f.rule_id)).toEqual(
    expect.arrayContaining(["CON-11", "CON-12", "CON-13", "CON-14"]),
  );
  expect(outcomes("D05", 2).findings.map((f) => f.rule_id)).not.toEqual(
    expect.arrayContaining(["CON-11", "CON-13"]),
  );
});
it("amended prices conflict until consistent round 3, while D08 later amendment creates a current blocker", () => {
  expect(outcomes("D06", 1).findings.map((f) => f.rule_id)).toContain("CON-03");
  expect(outcomes("D06", 2).findings.map((f) => f.rule_id)).toContain("CON-03");
  expect(outcomes("D06", 3).findings).toEqual([]);
  expect(outcomes("D08", 2).findings.map((f) => f.rule_id)).toContain("CON-03");
});
