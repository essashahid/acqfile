import "./load-env";
import fs from "node:fs";
import { writeScorecard } from "./scorecard";
process.env.ACQFILE_DB = "test";
process.env.LLM_PROVIDER = "openai";
process.env.JOB_DRIVER = "inline";
process.env.STORAGE_DRIVER = "local";
process.env.AUTH_DRIVER = "local";
process.env.PUBLIC_DEMO_MODE = "false";
process.env.DEMO_MUTATIONS_ENABLED = "true";
async function main() {
  fs.mkdirSync("eval", { recursive: true });
  const record = (status: string, reason: string, estimateUsd = 0) => {
    fs.writeFileSync(
      "eval/live.json",
      JSON.stringify(
        {
          mode: "live",
          status,
          reason,
          estimateUsd,
          capUsd: 5,
          costUsd: 0,
          recordedAt: new Date().toISOString(),
          releaseBlockers: [],
        },
        null,
        2,
      ) + "\n",
    );
    writeScorecard();
    console.log(`${status}: ${reason}; estimated USD ${estimateUsd.toFixed(2)}`);
  };
  if (!process.env.OPENAI_API_KEY) {
    record("skipped", "No owner-supplied provider key in the environment");
    return;
  }
  const { env } = await import("@/lib/env");
  const { estimateCostUsd } = await import("@/lib/config");
  const { plans } = await import("../fixtures/lib/plans");
  const { documents } = await import("../fixtures/lib/truth");
  const { startLiveBudget } = await import("@/lib/eval/live-budget");
  const e = env();
  // Conservative preflight: classification plus two reads and independent verification for
  // every segment. Include the existing retry allowance; abort without spending if above cap.
  let estimateUsd = 0;
  for (const plan of plans().filter((p) => p.id !== "deal-b")) {
    for (const doc of documents(plan).filter(
      (d) => d.batch === 1 && !d.pipeline.duplicate_of && !d.pipeline.unreadable,
    )) {
      const bytes = fs.statSync(`fixtures/deals/${plan.id}/${doc.file}`).size;
      const pages = Math.max(1, ...doc.segments.map((s) => s.page_end));
      const input = 65536 + Math.ceil((bytes * 4) / 3) + pages * 32768;
      estimateUsd +=
        (1 + e.LLM_MAX_RETRIES) *
        (estimateCostUsd(e.OPENAI_EXTRACT_MODEL, input, 5000) +
          doc.segments.length *
            (2 * estimateCostUsd(e.OPENAI_EXTRACT_MODEL, input, 8000) +
              estimateCostUsd(e.OPENAI_VERIFY_MODEL, input, 8000)));
    }
  }
  if (estimateUsd > 5) {
    record(
      "aborted",
      "Conservative preflight estimate exceeds USD 5; no provider calls made",
      estimateUsd,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Preflight estimate USD ${estimateUsd.toFixed(2)}; hard cap USD 5`);
  startLiveBudget();
  const { runEvaluation } = await import("./evaluate-deals");
  await runEvaluation(true);
}
main().catch(async (error) => {
  console.error(error);
  fs.writeFileSync(
    "eval/live.json",
    JSON.stringify(
      {
        mode: "live",
        status: "failed",
        reason: String(error),
        releaseBlockers: ["Live proof did not complete"],
      },
      null,
      2,
    ) + "\n",
  );
  writeScorecard();
  const { closeDb } = await import("@/lib/db/client");
  await closeDb();
  process.exitCode = 1;
});
