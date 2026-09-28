// Shared helpers for the LoanDocket explainer recording. Video tooling only; not product code.
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const HERE = path.join(ROOT, "artifacts/loandocket-explainer");
export const WORK = path.join(HERE, "work");
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });

if (process.env.REAL_DATA_MODE === "true")
  throw new Error("Refusing to record: REAL_DATA_MODE is on.");

/** The app must be named explicitly and must be local; there is deliberately no default port. */
export const BASE = (() => {
  const raw = process.env.EXPLAINER_BASE_URL;
  if (!raw)
    throw new Error(
      "Set EXPLAINER_BASE_URL to the local LoanDocket sample app (for example http://localhost:3200).",
    );
  const u = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.protocol !== "http:")
    throw new Error(`EXPLAINER_BASE_URL must be a local http address, not ${u.origin}.`);
  return u.origin;
})();

export const OPERATOR = {
  email: process.env.DEMO_REVIEWER_EMAIL || "reviewer@example.com",
  password: process.env.DEMO_REVIEWER_PASSWORD || "acqfile-reviewer",
};

/** Take names become folder names under work/: short, lower-case, no separators or dots. */
export function takeDir(name) {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(name))
    throw new Error(
      `Invalid take name ${JSON.stringify(name)}: use 1-48 of a-z, 0-9, "-" or "_", starting with a letter or digit.`,
    );
  const dir = path.resolve(WORK, name);
  if (path.dirname(dir) !== WORK) throw new Error(`Take ${name} resolves outside work/.`);
  return dir;
}

export async function launch({ video, viewport = { width: 1600, height: 900 }, scale = 1.2 } = {}) {
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    acceptDownloads: true,
    ...(video ? { recordVideo: { dir: video, size: { width: 1920, height: 1080 } } } : {}),
  });
  return { browser, context };
}

export async function signIn(page, user = OPERATOR) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.waitForLoadState("networkidle");
}
