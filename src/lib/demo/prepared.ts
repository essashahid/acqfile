/** Mock-provider boundary only: authored candidates, never expected evaluation results. */
import fs from "node:fs";
import path from "node:path";
export function preparedDemoFiles() {
  if (process.env.ACQFILE_SAMPLE_MODE !== "true" || process.env.REAL_DATA_MODE !== "false")
    return [];
  const file = path.join(process.cwd(), "fixtures/demo/generated/prepared-candidates.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}
