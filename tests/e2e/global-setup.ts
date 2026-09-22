import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import { execFileSync } from "node:child_process";

/** Reset and seed the TEST database before the e2e run (runs the project scripts in a child process). */
export default async function globalSetup() {
  const env = {
    ...process.env,
    ACQFILE_DB: "test",
    PII_HMAC_KEY: FIXTURE_HMAC_KEY,
    LLM_PROVIDER: "mock",
    JOB_DRIVER: "inline",
    STORAGE_DRIVER: "local",
    AUTH_DRIVER: "local",
    PUBLIC_DEMO_MODE: "false",
    DEMO_MUTATIONS_ENABLED: "true",
  };
  execFileSync("pnpm", ["exec", "tsx", "scripts/reset.ts"], { env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "scripts/seed-demo.ts", "--users-only"], {
    env,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["exec", "tsx", "tests/e2e/prepare.ts"], { env, stdio: "inherit" });
}
