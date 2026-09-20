import "./load-env";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
/** Until Phase 6, `pnpm eval` runs the Phase 3 and Phase 4 gates: the mock-mode pipeline, extraction and evaluation proofs. */
const files = ["tests/integration/deal-pipeline.test.ts", "tests/integration/deal-extraction.test.ts", "tests/integration/deal-evaluation.test.ts"];
const result = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.integration.config.mts", ...files], { stdio: "inherit", env: { ...process.env, ACQFILE_DB: "test" } });
for (const proof of ["/tmp/acqfile-phase3-pipeline-proof.json", "/tmp/acqfile-phase4-step-a-proof.json", "/tmp/acqfile-phase4-step-b-proof.json"])
  if (fs.existsSync(proof)) console.log(`\n${proof}\n${fs.readFileSync(proof, "utf8").slice(0, 4000)}`);
process.exitCode = result.status ?? 1;
