import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { login } from "./helpers";
const deals = () => JSON.parse(fs.readFileSync("/tmp/acqfile-browser-deals.json", "utf8"));
test("Deal A lifecycle through checklist, requests and snapshots", async ({ page }) => {
  await login(page);
  const { id, bea } = deals()["deal-a"];
  await page.goto(`/deals/${id}/checklist`);
  await expect(page.getByRole("heading", { name: "Checklist", exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="ENT-01-"]')).toContainText("received_with_issues");
  await page.goto(`/deals/${id}/package`);
  await page.getByRole("button", { name: "Generate snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Snapshot 1", exact: true })).toBeVisible();
  await page.goto(`/deals/${id}/requests`);
  const seller = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "seller", exact: true }) });
  await seller.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText(/seller · 0 days/)).toBeVisible();
  await page.goto(`/deals/${id}`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve("fixtures/deals/deal-a/batch-2.zip"));
  await page.getByRole("button", { name: "Upload batch" }).click();
  await expect(page.getByText("Batch 2: 3 files received")).toBeVisible({ timeout: 120000 });
  await page.goto(`/deals/${id}/checklist`);
  const citizenship = page.getByTestId(`GUA-05-${bea}-`);
  await citizenship
    .getByLabel("manual_confirmation reason")
    .fill("Synthetic lender handling confirmed");
  await citizenship.getByRole("button", { name: "Save confirmation" }).click();
  await expect(citizenship).toContainText("satisfied");
  await page.goto(`/deals/${id}/package`);
  await page.getByRole("button", { name: "Generate snapshot" }).click();
  const snapshot = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Snapshot 2", exact: true }) });
  await expect(snapshot).toContainText("ENT-01");
  await expect(snapshot).toContainText("GUA-02");
  await expect(snapshot).toContainText("GUA-05");
  await expect(snapshot).toContainText("1919-fixed");
  const download = page.waitForEvent("download");
  await snapshot.getByRole("link", { name: "Download ZIP 2" }).click();
  const zip = await JSZip.loadAsync(fs.readFileSync((await (await download).path())!));
  expect(zip.file("00_Package_Report.html")).not.toBeNull();
  const report = await page.context().newPage();
  await report.setContent(await zip.file("00_Package_Report.html")!.async("string"));
  const printed = await PDFDocument.load(await report.pdf({ preferCSSPageSize: true }));
  expect(printed.getPageCount()).toBe(1);
  await report.close();
  expect(zip.file("00_Package_Workbook.xlsx")).not.toBeNull();
});
test("Deal B package follows Sample Lender A naming", async ({ page }) => {
  await login(page);
  const { id } = deals()["deal-b"];
  await page.goto(`/deals/${id}/package`);
  await page.getByRole("button", { name: "Generate snapshot" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP 1" }).click();
  const zip = await JSZip.loadAsync(fs.readFileSync((await (await download).path())!));
  expect(Object.keys(zip.files).some((p) => p.includes("/SLA_"))).toBe(true);
});
test("Viewer can read screens but cannot change data or open originals", async ({ page }) => {
  await login(page, { email: "viewer@example.com", password: "acqfile-viewer" });
  const { id } = deals()["deal-a"];
  for (const route of ["checklist", "findings", "requests", "package"]) {
    await page.goto(`/deals/${id}/${route}`);
    await expect(
      page.getByRole("button", {
        name: /Generate snapshot|Mark as sent|Save confirmation|Save tracking|Waive|Dismiss/,
      }),
    ).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: /Download ZIP/ })).toHaveCount(0);
  await page.goto(`/deals/${id}`);
  await expect(page.getByRole("button", { name: /Upload batch|Retry file/ })).toHaveCount(0);
  await page.locator('a[href*="/files/"]').first().click();
  await expect(page.getByRole("link", { name: "Original file" })).toHaveCount(0);
  await expect(
    page.getByText(/Original documents are available to admin and operator/),
  ).toBeVisible();
});
