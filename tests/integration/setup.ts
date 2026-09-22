import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import { beforeAll, afterAll, vi } from "vitest";
import dotenv from "dotenv";

vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-15T00:00:00Z") });

process.env.ACQFILE_DB = "test";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LLM_PROVIDER = "mock";
process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
process.env.JOB_DRIVER = "inline";
process.env.STORAGE_DRIVER = "local";
process.env.AUTH_DRIVER = "local";
dotenv.config({ override: false });

beforeAll(async () => {
  const { getSql } = await import("@/lib/db/client");
  const { resetDatabase } = await import("@/lib/db/migrate");
  await resetDatabase(getSql());
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/client");
  await closeDb();
});
