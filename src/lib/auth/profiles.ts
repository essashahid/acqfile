import { env } from "@/lib/env";

export type DemoProfileKey = "adviser" | "reviewer" | "viewer" | "admin";

export type DemoProfile = {
  key: DemoProfileKey;
  title: string;
  summary: string;
  /** Where the profile lands after entering. */
  home: string;
};

/**
 * The ways a visitor can enter the sample workspace without typing a password.
 * Titles match the labels the app shows for each role (see staff/roles.ts). Each
 * maps to a seeded account whose credentials come from the same variables the
 * seed uses, so the sample site needs no extra configuration.
 */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    key: "adviser",
    title: "Adviser",
    summary: "Sends people their personal links and watches each loan file come together.",
    home: "/deals",
  },
  {
    key: "reviewer",
    title: "Operator",
    summary: "Reads what people sent, records answers and prepares the lender file.",
    home: "/staff/deals",
  },
  {
    key: "viewer",
    title: "Reviewer",
    summary: "Looks over the evidence and recorded decisions. Read-only.",
    home: "/staff/deals",
  },
  {
    key: "admin",
    title: "Admin",
    summary: "Every staff tool, plus the workspace rules and how it works.",
    home: "/staff/deals",
  },
];

/** Profiles are a sample-site convenience; hosted auth providers manage their own users. */
export function demoProfilesEnabled(): boolean {
  const e = env();
  return e.DEMO_PROFILES_ENABLED && e.AUTH_DRIVER !== "supabase";
}

export function demoProfile(key: string): DemoProfile | null {
  return DEMO_PROFILES.find((p) => p.key === key) ?? null;
}

export function demoProfileCredentials(key: DemoProfileKey): { email: string; password: string } {
  const e = env();
  switch (key) {
    case "adviser":
      return { email: e.DEMO_ADVISER_EMAIL, password: e.DEMO_ADVISER_PASSWORD };
    case "reviewer":
      return { email: e.DEMO_REVIEWER_EMAIL, password: e.DEMO_REVIEWER_PASSWORD };
    case "viewer":
      return { email: e.DEMO_VIEWER_EMAIL, password: e.DEMO_VIEWER_PASSWORD };
    case "admin":
      return { email: e.DEMO_ADMIN_EMAIL, password: e.DEMO_ADMIN_PASSWORD };
  }
}
