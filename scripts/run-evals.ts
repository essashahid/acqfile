import "./load-env";
// Set mode before importing application modules, which memoize environment configuration.
process.env.ACQFILE_DB = "test";
process.env.LLM_PROVIDER = "mock";
process.env.JOB_DRIVER = "inline";
process.env.STORAGE_DRIVER = "local";
process.env.AUTH_DRIVER = "local";
process.env.PUBLIC_DEMO_MODE = "false";
process.env.DEMO_MUTATIONS_ENABLED = "true";
async function main() {
  const { runEvaluation } = await import("./evaluate-deals");
  await runEvaluation();
}
main().catch(async (error) => {
  console.error(error);
  const { closeDb } = await import("@/lib/db/client");
  await closeDb();
  process.exitCode = 1;
});
