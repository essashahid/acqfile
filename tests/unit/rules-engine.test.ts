import { describe, it, expect } from "vitest";
import { evaluateDeal } from "@/lib/rules/engine";
import { loadPack } from "@/lib/rules/loader";
import {
  actualRows,
  expectedRows,
  fixtureInput,
  readFixture,
  applyCase,
  type Case,
} from "./engine-fixtures";
describe("hand-authored engine proof", () => {
  it("clean: all applicable rows satisfied, zero findings", () => {
    const result = evaluateDeal(fixtureInput(), loadPack("sop-50-10-8"));
    expect(actualRows(result.checklist)).toEqual(
      expectedRows(readFixture("clean").expected.checklist),
    );
    expect(result.findings).toEqual([]);
  });
  for (const file of ["defects", "unknowns", "traps", "packs"]) {
    for (const c of readFixture(file) as Case[])
      it(`${file}: ${c.name}`, () => {
        const cType = c.check_type;
        const { input, pack } = applyCase(c);
        const result = evaluateDeal(input, pack);
        if (c.check_type && !result.checklist.some((r) => r.status === "missing"))
          expect(
            result.checklist.some((r) =>
              r.reasons.some((c) => c.type === cType && c.result === "fail"),
            ),
          ).toBe(true);
        expect(actualRows(result.checklist)).toEqual(expectedRows(c.expected.checklist));
        expect(result.findings.map((f) => f.rule_id).sort()).toEqual(
          [...c.expected.findings].sort(),
        );
      });
  }
});
