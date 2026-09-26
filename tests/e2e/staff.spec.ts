import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { login } from "./helpers";
import type { seedPortal } from "../../scripts/seed-portal";
const deals = (): Awaited<ReturnType<typeof seedPortal>> =>
  JSON.parse(fs.readFileSync("/tmp/acqfile-browser-deals.json", "utf8"));
const shots = "docs/screenshots/role-redesign";
async function shot(page: Page, name: string) {
  await expect(page.getByRole("heading", { name: "Opening your workspace…" })).toHaveCount(0);
  await expect(page.getByText("Loading source page…", { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${shots}/${name}.png`, animations: "disabled", caret: "initial" });
}
async function layoutCheck(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const unnamed = await page.locator('input:not([type="hidden"]),select,textarea').evaluateAll(
    (nodes) =>
      nodes.filter((n) => {
        const input = n as HTMLInputElement;
        return (
          !input.labels?.length &&
          !input.getAttribute("aria-label") &&
          !input.getAttribute("aria-labelledby")
        );
      }).length,
  );
  expect(unnamed).toBe(0);
}

test("Deal navigation reserves layout space and keeps every section accessible", async ({
  page,
}) => {
  await login(page);
  const base = `/staff/deals/${deals()["deal-a"]!.id}`;
  const labels = [
    "Overview",
    "Documents",
    "Requirements",
    "Review",
    "Follow-ups",
    "Lender file",
    "Profile and rules",
  ];

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(base);
    const navigation = page.getByRole("navigation", { name: "Deal sections" });
    const content = page.locator(".deal-shell > .min-w-0");

    for (const label of labels)
      await expect(
        navigation.getByRole("link", { name: new RegExp(`^${label}\\b`) }),
      ).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.evaluate(() => scrollTo(0, 250));
    const [navigationBox, contentBox] = await Promise.all([
      navigation.boundingBox(),
      content.boundingBox(),
    ]);
    expect(navigationBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    const horizontalOverlap = Math.max(
      0,
      Math.min(navigationBox!.x + navigationBox!.width, contentBox!.x + contentBox!.width) -
        Math.max(navigationBox!.x, contentBox!.x),
    );
    const verticalOverlap = Math.max(
      0,
      Math.min(navigationBox!.y + navigationBox!.height, contentBox!.y + contentBox!.height) -
        Math.max(navigationBox!.y, contentBox!.y),
    );
    expect(horizontalOverlap * verticalOverlap).toBe(0);
  }

  await page.evaluate(() => scrollTo(0, 0));
  await page
    .getByRole("navigation", { name: "Deal sections" })
    .getByRole("link", { name: /^Documents\b/ })
    .click();
  await expect(page).toHaveURL(`${base}/documents`);
  await expect(
    page
      .getByRole("navigation", { name: "Deal sections" })
      .getByRole("link", { name: /^Documents\b/ }),
  ).toHaveAttribute("aria-current", "page");
});

for (const [role, account, heading] of [
  ["admin", "admin", "Workspace oversight"],
  ["operator", "reviewer", "Work to move forward"],
  ["reviewer", "viewer", "Files to review"],
] as const) {
  test(`${role}: complete navigation, evidence, history and permissions`, async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(shots, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, { email: `${account}@example.com`, password: `acqfile-${account}` });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await shot(page, `${role}-deals`);
    await page.getByLabel("Find a deal").fill("no such synthetic business");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText(/No deals match/)).toBeVisible();
    await shot(page, `${role}-no-results`);
    const base = `/staff/deals/${deals()["deal-a"]!.id}`;
    for (const [name, path, title] of [
      [
        "overview",
        "",
        role === "admin"
          ? "File oversight"
          : role === "operator"
            ? "Move the file forward"
            : "Evidence and decisions",
      ],
      ["documents", "/documents", "Documents"],
      ["requirements", "/requirements", "Requirements"],
      ["requirements-all", "/requirements?show=all", "Requirements"],
      ["excluded", "/requirements?show=not_applicable", "Requirements"],
      ["review", "/review", "Review"],
      ["history", "/review?show=history", "Review"],
      ["follow-ups", "/follow-ups", "Follow-ups"],
      ["lender-file", "/lender-file", "Lender file"],
      ["profile", "/profile", "Profile and rules"],
    ]) {
      await page.goto(base + path);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await layoutCheck(page);
      await shot(page, `${role}-${name}`);
      if (name === "excluded")
        await expect(page.getByText("Requirement waived", { exact: true })).toHaveCount(0);
    }
    for (const [path, title] of [
      ["rulepacks", "Rule packs"],
      ["how-it-works", "How it works"],
    ]) {
      await page.goto(`/staff/${path}`);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await layoutCheck(page);
      await shot(page, `${role}-${path}`);
    }
    await page.goto(base + "/documents");
    await page.getByRole("link", { name: "Open", exact: true }).first().click();
    await expect(page.getByText(/This file could not be opened/)).toBeVisible();
    await shot(page, `${role}-failed-file`);
    if (role === "reviewer")
      await expect(page.getByRole("button", { name: "File manually" })).toHaveCount(0);
    await page.goto(base + "/documents");
    await page.getByRole("link", { name: "Inspect values", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Decided values" })).toBeVisible();
    await page
      .getByRole("button", { name: /Show page/ })
      .first()
      .click();
    if (role !== "reviewer")
      await expect(
        page.locator("[aria-busy=false]").filter({ has: page.locator("canvas") }),
      ).toBeVisible();
    await shot(page, `${role}-values`);
    if (role === "reviewer") {
      await expect(page.getByRole("link", { name: "Original", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Accept|Reclassify|Reject/ })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + "/review");
    await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
    await layoutCheck(page);
    await shot(page, `${role}-review-1440`);
    await page.goto(base + "/documents?q=does-not-exist");
    await expect(page.getByText("No documents match these filters.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Search", { exact: true })).toHaveValue("does-not-exist");
    await page.goto(`/staff/deals/${deals()["deal-b"]!.id}/documents`);
    const pending = page.getByRole("link", { name: /to review/ }).first();
    await pending.click();
    await expect(page.getByRole("heading", { name: "Pending values" })).toBeVisible();
    await shot(page, `${role}-pending-values`);
    if (role === "reviewer")
      await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
    else
      await expect(page.getByRole("button", { name: "Accept", exact: true }).first()).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test("Operator decisions target one requirement, persist notes, and preserve immutable versions", async ({
  page,
  browser,
}) => {
  await login(page, { email: "reviewer@example.com", password: "acqfile-reviewer" });
  const base = `/staff/deals/${deals()["deal-a"]!.id}`;
  await page.goto(base + "/requirements?show=all");
  const tracking = page
    .locator('tr[data-testid^="LND-"]')
    .filter({ has: page.getByLabel("Tracking state") })
    .first();
  await tracking.locator("summary").click();
  // Regression for the former satisfied/not_started binding: the persisted control is received.
  await expect(tracking.getByLabel("Tracking state")).toHaveValue("received");
  const row = page.locator('tr[data-testid^="GUA-02-"]').first();
  const key = await row.getAttribute("data-testid");
  await row.locator("summary").click();
  await row
    .getByLabel("waiver reason")
    .fill("Synthetic staff browser proof: requirement waived after review.");
  await row.getByRole("button", { name: "Waive row" }).click();
  await expect(
    page.getByTestId(key!).getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await page.reload();
  const saved = page.getByTestId(key!);
  await expect(saved.getByText("Waived", { exact: true })).toBeVisible();
  await saved.locator("summary").click();
  await expect(
    saved.getByText("Synthetic staff browser proof: requirement waived after review."),
  ).toBeVisible();
  await shot(page, "operator-requirement-decision");
  await page.goto(base + "/follow-ups");
  const first = page
    .locator("section.card")
    .filter({ has: page.getByRole("button", { name: "Record as sent", exact: true }) })
    .first();
  const draft = await first.locator("pre").innerText();
  expect(draft).not.toMatch(
    /page null|\b(?:needs_review|received_with_issues|fact_id|scope_key)\b|rule parameters|[a-f0-9]{64}/,
  );
  await first.getByRole("button", { name: "Record as sent", exact: true }).click();
  await page.getByRole("button", { name: "Yes, record it", exact: true }).click();
  await expect(page.getByText("Recorded message").first()).toBeVisible();
  await page.goto(base + "/lender-file");
  for (let number = 1; number <= 2; number++) {
    await page.getByRole("button", { name: "Create a version while work is outstanding" }).click();
    await page.getByRole("button", { name: "Create version anyway" }).click();
    await expect(
      page.getByRole("heading", { name: `Version ${number}`, exact: true }),
    ).toBeVisible();
    if (number === 1) await page.reload();
  }
  const downloadUrl = await page.getByRole("link", { name: "Download ZIP" }).getAttribute("href");
  const zip = await page.request.get(downloadUrl!);
  expect(zip.ok()).toBe(true);
  await shot(page, "operator-version-history");
  await page.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Version 1", exact: true })).toBeVisible();
  const readonly = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const reviewer = await readonly.newPage();
  await login(reviewer, { email: "viewer@example.com", password: "acqfile-viewer" });
  const forbidden = await reviewer.request.get(downloadUrl!);
  expect(forbidden.status()).toBe(403);
  await reviewer.goto(base + "/lender-file?version=1");
  await expect(reviewer.getByRole("heading", { name: "Version 1", exact: true })).toBeVisible();
  await expect(reviewer.getByRole("link", { name: "Download ZIP" })).toHaveCount(0);
  await shot(reviewer, "reviewer-version-history");
  await readonly.close();
});

test("Admin intake shows mixed results, duplicate history and a recoverable selection error", async ({
  page,
}) => {
  await login(page);
  const base = `/staff/deals/${deals()["deal-a"]!.id}`;
  await page.goto(base + "/documents#intake");
  await page.getByLabel("Files or ZIP", { exact: true }).setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Upload batch", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "each no larger than 10 MB" }),
  ).toBeVisible();
  await shot(page, "admin-upload-validation");
  const documents = JSON.parse(
    fs.readFileSync("fixtures/deals/deal-a/truth/documents.json", "utf8"),
  );
  const original = documents.find(
    (d: { batch: number; format: string }) => d.batch === 1 && d.format === "text_pdf",
  );
  await page.getByLabel("Files or ZIP", { exact: true }).setInputFiles([
    {
      name: "repeat-copy.pdf",
      mimeType: "application/pdf",
      buffer: fs.readFileSync(`fixtures/deals/deal-a/${original.file}`),
    },
    {
      name: "unreadable-copy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nSYNTHETIC incomplete bytes for an unreadable-file test"),
    },
  ]);
  await page.getByRole("button", { name: "Upload batch", exact: true }).click();
  await expect(page.getByText("Duplicate; existing copy retained", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Could not be read; no evidence supplied", { exact: true }),
  ).toBeVisible();
  await shot(page, "admin-upload-partial-results");
  await page.reload();
  await page.getByText("Upload history and technical detail", { exact: true }).click();
  await expect(page.getByRole("link", { name: "repeat-copy.pdf", exact: true })).toBeVisible();
});

test("Operator can reject a pending value with a reason and inspect the saved decision", async ({
  page,
}) => {
  await login(page, { email: "reviewer@example.com", password: "acqfile-reviewer" });
  await page.goto(`/staff/deals/${deals()["deal-b"]!.id}/documents`);
  await page
    .getByRole("link", { name: /to review/ })
    .first()
    .click();
  const pending = page.getByRole("group", { name: /^Pending / }).first();
  await pending
    .getByLabel(/^Comment /)
    .fill("Synthetic browser review: source does not support this value.");
  await pending.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decision saved" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Synthetic browser review: source does not support this value.", {
      exact: true,
    }),
  ).toBeVisible();
  await shot(page, "operator-value-decision");
});

test("Admin profile editor supports a long business name and an empty file without invented readiness", async ({
  page,
}) => {
  await login(page);
  await page.goto("/staff/deals/new");
  await page.getByText("Advanced: import a profile", { exact: true }).click();
  const draft = JSON.parse(fs.readFileSync("fixtures/deals/deal-a/truth/deal.json", "utf8"));
  draft.code = "Staff-empty-proof";
  draft.name =
    "Varnholt Climate Services LLC — synthetic review of the acquisition file, ownership records, financial statements and documents supplied by the parties";
  await page.getByLabel("Profile JSON", { exact: true }).fill(JSON.stringify(draft));
  await page.getByRole("button", { name: "Load JSON", exact: true }).click();
  await page.getByRole("button", { name: "Save deal", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/deals\/[a-f0-9-]{36}$/);
  await expect(page.getByRole("heading", { name: "File oversight", exact: true })).toBeVisible();
  const base = new URL(page.url()).pathname;
  await layoutCheck(page);
  await shot(page, "admin-long-name");
  await page.goto(base + "/documents");
  await expect(page.getByText("Nothing has been filed yet.")).toBeVisible();
  await shot(page, "admin-empty-library");
  await page.goto(base + "/lender-file");
  await expect(page.getByRole("heading", { name: "No version yet" })).toBeVisible();
  // The shared Pass 3 status names the preparation boundary; an empty file still cannot be ready.
  await expect(page.getByText("Preparation work outstanding", { exact: true })).toBeVisible();
  await shot(page, "admin-empty-version");
  await page.goto(base + "/documents/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "This view could not be opened" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await shot(page, "admin-recoverable-error");
});
