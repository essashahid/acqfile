import { afterEach, describe, expect, it, vi } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});
function production() {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NEXT_PHASE", "runtime");
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://user:password@ep-test.us-east-1.aws.neon.tech/acqfile?sslmode=require",
  );
  vi.stubEnv("AUTH_DRIVER", "database");
  vi.stubEnv("AUTH_SECRET", "a".repeat(96));
  vi.stubEnv("STORAGE_DRIVER", "blob");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  vi.stubEnv("JOB_DRIVER", "inngest");
  vi.stubEnv("INNGEST_EVENT_KEY", "event-test");
  vi.stubEnv("INNGEST_SIGNING_KEY", "signing-test");
  vi.stubEnv("LLM_PROVIDER", "mock");
  resetEnvCache();
}
describe("hosted configuration", () => {
  it("supports Neon sessions and private Blob without Supabase", () => {
    production();
    expect(env().AUTH_DRIVER).toBe("database");
  });
  it("rejects transaction-pooled Neon connections", () => {
    production();
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@ep-test-pooler.us-east-1.aws.neon.tech/db");
    expect(() => env()).toThrow("direct database");
  });
  it("rejects weak production session secrets", () => {
    production();
    vi.stubEnv("AUTH_SECRET", "dev-secret");
    expect(() => env()).toThrow("AUTH_SECRET");
  });
  it("rejects ephemeral production storage", () => {
    production();
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(() => env()).toThrow("persistent storage");
  });
  it("requires a Blob credential", () => {
    production();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(() => env()).toThrow("BLOB_READ_WRITE_TOKEN");
  });
});
describe("A35 real data and public demo", () => {
  it("refuses to start with REAL_DATA_MODE=true and PUBLIC_DEMO_MODE=true together", () => {
    vi.stubEnv("REAL_DATA_MODE", "true");
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    resetEnvCache();
    expect(() => env()).toThrow(
      "REAL_DATA_MODE=true cannot be combined with PUBLIC_DEMO_MODE=true",
    );
  });
  it("keeps the synthetic public demo available", () => {
    vi.stubEnv("REAL_DATA_MODE", "false");
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    resetEnvCache();
    expect(env().PUBLIC_DEMO_MODE).toBe(true);
  });
  it("does not accept real-data mode before the pilot runbook exists", () => {
    vi.stubEnv("REAL_DATA_MODE", "true");
    vi.stubEnv("PUBLIC_DEMO_MODE", "false");
    resetEnvCache();
    expect(() => env()).toThrow("Invalid environment");
  });
});
