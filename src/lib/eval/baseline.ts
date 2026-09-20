import fs from "node:fs";
import type { RegressionMetrics } from "./regression";
export function readBaseline(): RegressionMetrics | null {
  return fs.existsSync("eval/baseline.json")
    ? JSON.parse(fs.readFileSync("eval/baseline.json", "utf8")).regressionMetrics
    : null;
}
export function savePassingBaseline(report: { passed: boolean }, replace = false) {
  if (!report.passed) throw Error("A failing run cannot become the baseline");
  if (replace || !fs.existsSync("eval/baseline.json"))
    fs.writeFileSync("eval/baseline.json", JSON.stringify(report, null, 2) + "\n");
}
