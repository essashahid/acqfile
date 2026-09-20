import "./load-env";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { getSql, closeDb } from "@/lib/db/client";

/** Capture every staff screen at desktop width. Run against a seeded database with `pnpm dev` up. */
async function main() {
  const baseURL = process.env.STAFF_SCREENS_URL ?? "http://localhost:3000";
  const sql = getSql();
  const [deal] = await sql`select id from deals where code='Portal-deal-c'`;
  const [segment] =
    await sql`select id, document_version_id from segments where deal_id=${deal!.id} and is_current and status='confirmed' order by created_at limit 1`;
  const [version] =
    await sql`select id from document_versions where deal_id=${deal!.id} order by created_at limit 1`;
  const d = `/staff/deals/${deal!.id}`;
  const routes: [string, string][] = [
    ["deals", "/staff/deals"],
    ["overview", d],
    ["documents", `${d}/documents`],
    ["requirements", `${d}/requirements`],
    ["requirements-all", `${d}/requirements?show=all`],
    ["review", `${d}/review`],
    ["review-history", `${d}/review?show=history`],
    ["follow-ups", `${d}/follow-ups`],
    ["lender-file", `${d}/lender-file`],
    ["profile", `${d}/profile`],
    ["document-detail", `${d}/documents/${version!.id}`],
    ["values-review", `${d}/documents/${segment!.document_version_id}/values/${segment!.id}`],
    ["rulepacks", "/staff/rulepacks"],
  ];
  const out = "docs/screenshots/staff";
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/email/i).fill(process.env.DEMO_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel(/password/i).fill(process.env.DEMO_ADMIN_PASSWORD ?? "acqfile-admin");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    for (const [name, route] of routes) {
      // The review screens render a PDF, so the network never fully idles.
      await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
      console.log(`${name}: ${route}`);
    }
  } finally {
    await browser.close();
    await closeDb();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
