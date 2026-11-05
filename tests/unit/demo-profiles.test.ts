import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_PROFILES,
  demoProfile,
  demoProfileCredentials,
  demoProfilesEnabled,
} from "@/lib/auth/profiles";
import { resetEnvCache } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe("demo profiles", () => {
  it("offers the seeded roles under the labels the app shows, each with a home in its own area", () => {
    expect(DEMO_PROFILES.map((p) => p.key)).toEqual(["adviser", "reviewer", "viewer", "admin"]);
    expect(DEMO_PROFILES.map((p) => p.title)).toEqual(["Adviser", "Operator", "Reviewer", "Admin"]);
    expect(demoProfile("adviser")?.home).toBe("/deals");
    expect(demoProfile("reviewer")?.home).toBe("/staff/deals");
    expect(demoProfile("viewer")?.home).toBe("/staff/deals");
    expect(demoProfile("admin")?.home).toBe("/staff/deals");
    expect(demoProfile("owner")).toBeNull();
    expect(demoProfile("")).toBeNull();
  });

  it("uses the same credentials the seed uses", () => {
    delete process.env.DEMO_ADVISER_EMAIL;
    delete process.env.DEMO_REVIEWER_PASSWORD;
    process.env.DEMO_ADMIN_EMAIL = "ops@example.com";
    resetEnvCache();
    expect(demoProfileCredentials("adviser")).toEqual({
      email: "adviser@example.com",
      password: "acqfile-adviser",
    });
    expect(demoProfileCredentials("reviewer").password).toBe("acqfile-reviewer");
    expect(demoProfileCredentials("viewer").email).toBe("viewer@example.com");
    expect(demoProfileCredentials("admin").email).toBe("ops@example.com");
  });

  it("is on by default, off when disabled or when a hosted auth provider owns the users", () => {
    delete process.env.DEMO_PROFILES_ENABLED;
    process.env.AUTH_DRIVER = "local";
    resetEnvCache();
    expect(demoProfilesEnabled()).toBe(true);
    process.env.AUTH_DRIVER = "database";
    resetEnvCache();
    expect(demoProfilesEnabled()).toBe(true);
    process.env.DEMO_PROFILES_ENABLED = "false";
    resetEnvCache();
    expect(demoProfilesEnabled()).toBe(false);
    process.env.DEMO_PROFILES_ENABLED = "true";
    process.env.AUTH_DRIVER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    resetEnvCache();
    expect(demoProfilesEnabled()).toBe(false);
  });
});
