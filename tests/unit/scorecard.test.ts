import { describe, it, expect } from "vitest";
import { regression, type RegressionMetrics } from "@/lib/eval/regression";
import { savePassingBaseline } from "@/lib/eval/baseline";
import { reserveLiveCall, startLiveBudget } from "@/lib/eval/live-budget";
const clean: RegressionMetrics = {
  statusAccuracy: 100,
  plantedRecall: 100,
  falseSatisfiedBefore: 0,
  falseSatisfiedAfter: 0,
  trapsRaised: 0,
};
describe("scorecard release gates", () => {
  it("allows exactly two points, rejects a larger drop in either metric", () => {
    expect(regression({ ...clean, statusAccuracy: 98, plantedRecall: 98 }, clean)).toEqual([]);
    expect(
      regression({ ...clean, statusAccuracy: 97.99, plantedRecall: 97.99 }, clean),
    ).toHaveLength(2);
  });
  it("rejects false satisfied and traps even without a baseline", () => {
    expect(regression({ ...clean, falseSatisfiedBefore: 1, trapsRaised: 1 }, null)).toHaveLength(2);
    expect(regression({ ...clean, falseSatisfiedAfter: 1 }, clean)).toHaveLength(1);
    expect(() => savePassingBaseline({ passed: false })).toThrow("failing run");
  });
  it("reserves before spending and never refunds failed attempts", async () => {
    startLiveBudget(0.02);
    await reserveLiveCall("gpt-5.6-luna", "test", null, 8000);
    await expect(reserveLiveCall("gpt-5.6-luna", "retry", null, 8000)).rejects.toThrow(
      "budget exhausted",
    );
    startLiveBudget(0);
    await expect(reserveLiveCall("gpt-5.6-terra", "test", null, 8000)).rejects.toThrow(
      "budget exhausted",
    );
  });
});
