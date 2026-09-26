import { test, expect } from "@playwright/test";
import fs from "node:fs";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { FIXTURE_HMAC_KEY } from "../../fixtures/plans/shared";
import { closeDb } from "../../src/lib/db/client";
import { seedWorkspace } from "../../src/lib/seed";
import { recordAttestation } from "../../src/lib/evaluation/attestations";
import {
  fixtureDeal,
  uploadFixture,
  attestTruth,
  confirmBoundaries,
  reviewTruth,
  unlimited,
} from "../helpers/deal-proof";
import type { SessionContext } from "../../src/lib/workspace";
import { login } from "./helpers";
process.env.ACQFILE_DB = "test";
// Match the synthetic browser server when arranging evidence in this worker.
process.env.PII_HMAC_KEY = FIXTURE_HMAC_KEY;
process.env.REAL_DATA_MODE = "false";
process.env.LLM_PROVIDER = "mock";
process.env.JOB_DRIVER = "inline";
process.env.STORAGE_DRIVER = "local";
process.env.AUTH_DRIVER = "local";
let dealId: string;
let partyId: string;
test.beforeAll(async () => {
  // Arrange a sample with one genuine operator confirmation left. All subsequent work uses screens.
  const seed = await seedWorkspace();
  const ctx: SessionContext = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "admin" },
  };
  const d = await fixtureDeal(ctx, "deal-b", "BrowserPassThree");
  await attestTruth(ctx, d, 1);
  await uploadFixture(ctx, d, 1);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  await uploadFixture(ctx, d, 2);
  await confirmBoundaries(ctx, d);
  await reviewTruth(ctx, d);
  dealId = d.id;
  const confirmations = JSON.parse(
    fs.readFileSync("fixtures/deals/deal-b/truth/batch-2/engine_input.json", "utf8"),
  ).manual_confirmations;
  const confirmation = confirmations.find((c: { rule_id: string }) => c.rule_id === "GUA-05");
  partyId = d.internal(confirmation.scope_key);
  await unlimited();
  await recordAttestation(ctx, d.id, {
    ...confirmation,
    kind: "manual_confirmation",
    scope_key: partyId,
    confirmed: false,
    note: "Operator must finish checking the supplied synthetic evidence.",
  });
  await recordAttestation(ctx, d.id, {
    kind: "tracking",
    rule_id: "LND-01",
    scope_key: "deal",
    state: "ordered",
    note: "Explicitly later lender work in the illustrative policy.",
  });
});
test.afterAll(closeDb);
test("finishes preparation on screen and downloads a file with later lender work still outstanding", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await expect(page.getByText("Preparation work outstanding", { exact: true })).toBeVisible();
  await page.goto(`/staff/deals/${dealId}/requirements?show=all`);
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="rule_id"][value="GUA-05"]') })
    .filter({ has: page.locator(`input[name="scope_key"][value="${partyId}"]`) })
    .filter({
      has: page.getByRole("button", {
        name: "Save check record",
        exact: true,
        includeHidden: true,
      }),
    });
  const decisions = page.locator("details").filter({ has: form });
  await decisions.getByText("All checks and actions", { exact: true }).click();
  await form.getByLabel("Check status", { exact: true }).selectOption("true");
  await form
    .getByLabel("Check note")
    .fill("Inspected the supplied synthetic evidence and completed this preparation check.");
  await form.getByRole("button", { name: "Save check record", exact: true }).click();
  await expect(decisions.getByText(/^Recorded as completed:/)).toBeVisible();
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await expect(page.getByText("Prepared for lender review", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Illustrative checklist, awaiting lender review", { exact: true }),
  ).toBeVisible();
  // Later lender work names the item, its state and who owns it. The staff page reads these as
  // words, so the row is asserted by its parts rather than by a raw "title · role · status" string.
  const later = page.locator("li").filter({ hasText: "Credit reports" }).first();
  await expect(later.getByText("Tracking", { exact: true })).toBeVisible();
  await expect(later.getByText("Lender", { exact: true })).toBeVisible();
  const adviser = await browser.newContext();
  const customer = await adviser.newPage();
  await login(customer, { email: "adviser@example.com", password: "acqfile-adviser" });
  await customer.goto(`/deals/${dealId}`);
  await expect(customer.getByRole("heading", { name: "Prepared for lender review" })).toBeVisible();
  await expect(
    customer.getByText("Credit reports: Recorded, not yet received", { exact: true }),
  ).toBeVisible();
  const downloaded = customer.waitForEvent("download");
  await customer.getByRole("link", { name: "Download the lender file", exact: true }).click();
  const file = await downloaded;
  const zip = await JSZip.loadAsync(fs.readFileSync((await file.path())!));
  const report = await zip.file("00_Package_Report.html")!.async("string");
  expect(report).toContain("Prepared for lender review");
  const book = XLSX.read(await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer"));
  expect(XLSX.utils.sheet_to_json(book.Sheets["Status summary"]!)).toContainEqual(
    expect.objectContaining({
      Section: "Later lender work",
      Item: "Credit reports",
      "Status / detail": "tracking",
    }),
  );
  await adviser.close();
});
