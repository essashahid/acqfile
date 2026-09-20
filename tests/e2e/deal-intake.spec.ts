import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
test("Deal A: import, batch intake, bundle review, fact review, evaluation counts and corrected version", async ({
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
    page.getByText("LEASE · Varnholt Climate Services", { exact: false }).first(),
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
  // Phase 4: open the review screen for the scanned Form 413, edit one value and accept, and watch the counts change.
  const count = async (id: string) => Number(await page.getByTestId(id).textContent());
  const pendingBefore = await count("pending-values");
  await page.getByRole("link", { name: /^SBA_413 · / }).first().click();
  await expect(page.getByRole("heading", { name: /^Pending values/ })).toBeVisible();
  await expect(page.getByText("Original document. Identifiers are not masked here.")).toBeVisible();
  await expect(page.getByLabel("Source page", { exact: true })).toBeVisible();
  const cash = page.getByRole("group", { name: "Pending pfs.cash" });
  await expect(cash).toContainText("vision");
  await cash.getByLabel("Edit value pfs.cash").fill("180000.00");
  await cash.getByLabel("Comment pfs.cash").fill("Read from the statement page.");
  await cash.getByRole("button", { name: "Edit and accept" }).click();
  await expect(page.getByRole("status")).toHaveText("Decision saved");
  await page.goto(dealUrl);
  expect(await count("pending-values")).toBe(pendingBefore - 1);
  const missingBefore = await count("findings-missing");
  const incompleteBefore = await count("findings-incomplete");
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
  await page.goto(dealUrl);
  // Three findings disappear: the absent 2024 return, the absent citizenship evidence and the unsigned Form 1919.
  expect(missingBefore - (await count("findings-missing")) + (incompleteBefore - (await count("findings-incomplete")))).toBe(3);
  await page
    .getByRole("heading", { name: "Documents", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/acqfile-phase4-e2e.png",
    fullPage: true,
  });
});
