import "./load-env";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { getSql, closeDb } from "@/lib/db/client";

/** Capture every staff screen at desktop width. Run against a seeded database with `pnpm dev` up. */
async function main() {
  const baseURL = process.env.STAFF_SCREENS_URL ?? "http://localhost:3000";
  const sql = getSql();
  const [deal] = await sql`select id from deals order by created_at limit 1`;
  const [segment] =
    await sql`select id from segments where deal_id=${deal!.id} and is_current and status='confirmed' order by created_at limit 1`;
  const [version] =
    await sql`select id from document_versions where deal_id=${deal!.id} order by created_at limit 1`;
  const routes: [string, string][] = [
    ["deals", "/staff/deals"],
    ["deal-overview", `/staff/deals/${deal!.id}`],
    ["checklist", `/staff/deals/${deal!.id}/checklist`],
    ["findings", `/staff/deals/${deal!.id}/findings`],
    ["requests", `/staff/deals/${deal!.id}/requests`],
    ["package", `/staff/deals/${deal!.id}/package`],
    ["fact-review", `/staff/deals/${deal!.id}/segments/${segment!.id}/review`],
    ["file-review", `/staff/deals/${deal!.id}/files/${version!.id}`],
    ["rulepacks", "/staff/rulepacks"],
    ["how-it-works", "/staff/how-it-works"],
  ];
  const out = "docs/screenshots/staff";
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
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
