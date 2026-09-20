import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
test("Deal A: import, batch intake, bundle review, manual filing and corrected version", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page);
  await page.goto("/deals/new");
  await page.getByText("Import profile JSON", { exact: true }).click();
  const draft = JSON.parse(
    fs.readFileSync("fixtures/deals/deal-a/truth/deal.json", "utf8"),
  );
  draft.code = "E2E-A";
  await page
    .getByLabel("Profile JSON", { exact: true })
    .fill(JSON.stringify(draft));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await page.getByRole("button", { name: "Save deal", exact: true }).click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/);
  const dealUrl = page.url();
  await page
    .getByLabel("Files or ZIP", { exact: true })
    .setInputFiles("fixtures/deals/deal-a/batch-1.zip");
  await page.getByRole("button", { name: "Upload batch" }).click();
  await expect(page.getByRole("status")).toContainText("37 files received", {
    timeout: 120000,
  });
  await expect(
    page.getByRole("heading", { name: "Filed documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("LEASE · Varnholt Climate Services", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /· segmentation$/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Segments and filing" }),
  ).toBeVisible();
  await expect(page.getByLabel("Source page 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Original document. Identifiers are not masked here."),
  ).toBeVisible();
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Confirmed the logical document page ranges against the supplied pages.",
    );
  await page.getByRole("button", { name: "Confirm segments" }).click();
  await expect(page.getByRole("status")).toHaveText("Filing saved");
  await page.goto(dealUrl);
  await page
    .getByRole("link", { name: /· unreadable$/ })
    .first()
    .click();
  await page
    .getByLabel("Segment 1 type", { exact: true })
    .selectOption("FORMATION_DOC");
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Manually indexed as formation document; encrypted copy remains unreadable.",
    );
  await page.getByRole("button", { name: "File manually" }).click();
  await expect(page.getByRole("status")).toHaveText("Filing saved");
  await page.goto(dealUrl);
  await expect(
    page.getByText("FORMATION_DOC · manually indexed, unreadable", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Files or ZIP", { exact: true })
    .setInputFiles("fixtures/deals/deal-a/batch-2.zip");
  await page.getByRole("button", { name: "Upload batch" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Batch 2: 3 files received",
    { timeout: 120000 },
  );
  await expect(
    page.getByText("SBA_1919 · earlier segment superseded", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Documents", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/acqfile-phase3-e2e.png",
    fullPage: true,
  });
});
