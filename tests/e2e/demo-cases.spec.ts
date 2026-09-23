import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import JSZip from "jszip";
import { and, eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "../../src/lib/db/client";
import { portalData } from "../../src/lib/portal/service";
import { hashPassword } from "../../src/lib/auth/password";
import { login as signIn } from "./helpers";
async function login(page: Page, user?: { email: string; password: string }) {
  await signIn(page, user);
  await page.waitForURL(user?.email === "demo-adviser@example.com" ? "**/deals" : "**/staff/deals");
  await page.waitForLoadState("networkidle");
}
process.env.ACQFILE_DB = "test";
test.skip(
  !process.env.DEMO_CASE_WORKSPACE_ID,
  "Use the explicit demo browser configuration and seeded sample workspace.",
);
test.afterAll(closeDb);
const id = async (code: string) => {
  const [d] = await getDb()
    .select()
    .from(schema.deals)
    .where(
      and(
        eq(schema.deals.code, `Synthetic-${code}`),
        eq(schema.deals.workspaceId, process.env.DEMO_CASE_WORKSPACE_ID!),
      ),
    );
  expect(d, `Seed ${code} before the browser journey`).toBeDefined();
  return d!.id;
};
async function select(page: Page, code: string) {
  await page.goto("/staff/deals");
  await page.getByRole("combobox", { name: /demo case/i }).selectOption(code);
  await expect(page).toHaveURL(new RegExp(`/staff/deals/${await id(code)}$`));
  await expect(page.getByRole("complementary", { name: "Synthetic demo" })).toContainText(
    "Prepared sample extraction",
  );
}
async function preparation(page: Page, dealId: string) {
  await page.goto(`/staff/deals/${dealId}/requirements?show=all`);
  const forms = page
    .locator("form")
    .filter({ has: page.locator('input[name="kind"][value="manual_confirmation"]') });
  const count = await forms.count();
  for (let i = 0; i < count; i++) {
    const form = forms.nth(i);
    const rule = await form.locator('input[name="rule_id"]').inputValue();
    if (!["GUA-05", "TGT-09", "TXN-08"].includes(rule)) continue;
    const detail = form.locator("xpath=ancestor::details[1]");
    if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
    await form.getByLabel("Confirmation", { exact: true }).selectOption("true");
    await form
      .getByLabel("manual_confirmation reason")
      .fill(
        "Reviewed the supplied synthetic source and completed this illustrative preparation check.",
      );
    await form.getByRole("button", { name: "Save confirmation", exact: true }).click();
    await expect(detail.getByText("Confirmed by an operator", { exact: true })).toBeVisible();
  }
  const tracking = page
    .locator("form")
    .filter({ has: page.locator('input[name="rule_id"][value="TXN-08"]') })
    .filter({ has: page.locator('input[name="kind"][value="tracking"]') });
  if (await tracking.count()) {
    const detail = tracking.locator("xpath=ancestor::details[1]");
    if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
    await tracking.locator("select").selectOption("received");
    await tracking
      .locator('input[name="note"]')
      .fill("Synthetic valuation receipt reviewed for this preparation exercise.");
    await tracking.getByRole("button").click();
    await expect(tracking.getByRole("status")).toContainText("Saved.");
  }
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await expect(page.getByText("Prepared for lender review", { exact: true })).toBeVisible();
}
async function upload(page: Page, dealId: string, file: string) {
  await page.goto(`/staff/deals/${dealId}/documents`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Files or ZIP").setInputFiles(file);
  await page.getByRole("button", { name: "Upload batch", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Batch \d+: \d+ files received/ }),
  ).toBeVisible({ timeout: 60000 });
}
async function confirmFile(page: Page, dealId: string, versionId: string, signed?: boolean) {
  await page.goto(`/staff/deals/${dealId}/documents/${versionId}`);
  await page.waitForLoadState("networkidle");
  if (signed !== undefined)
    await page.getByLabel("Segment 1 signed", { exact: true }).selectOption(String(signed));
  const force = page.getByLabel("Keep this version as current (recorded in audit)");
  if (await force.count()) await force.check();
  await page
    .getByLabel("Review note")
    .fill("Inspected the supplied synthetic pages, boundaries, identity and signature.");
  await page.getByRole("button", { name: "Confirm segments", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Filing saved" })).toBeVisible();
}
test("D01 completes actual preparation through screens, exports and preserves progress when switching", async ({
  page,
}) => {
  await login(page);
  await select(page, "D01");
  const dealId = await id("D01");
  await preparation(page, dealId);
  await page.getByRole("button", { name: "Create lender-file version", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP", exact: true }).first().click();
  const file = await download;
  const zip = await JSZip.loadAsync(fs.readFileSync((await file.path())!));
  expect(zip.file("00_Package_Report.html")).not.toBeNull();
  await select(page, "D02");
  await select(page, "D01");
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await expect(page.getByText("Prepared for lender review", { exact: true })).toBeVisible();
});
test("D03 inspects raw forms and reopens a decided reading with retained history", async ({
  page,
}) => {
  await login(page);
  await select(page, "D03");
  const dealId = await id("D03");
  const [fact] = await getDb()
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.attribute, "pfs.cash"),
        eq(schema.facts.isCurrent, true),
        eq(schema.facts.routingStatus, "auto_accepted"),
      ),
    );
  expect(fact).toBeDefined();
  await page.goto(
    `/staff/deals/${dealId}/documents/${fact!.documentVersionId}/values/${fact!.segmentId}`,
  );
  const group = page.getByRole("group", { name: "Decision pfs.cash", exact: true });
  await group
    .getByLabel("Decision reason pfs.cash", { exact: true })
    .fill("Rechecking the decided reading against the revised personal statement.");
  await group.getByRole("button", { name: "Reopen review", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decision saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Pending pfs.cash", exact: true })).toBeVisible();
  await upload(page, dealId, "fixtures/demo/generated/D03/round-2.zip");
  const [replacement] = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.dealId, dealId),
        eq(schema.documentVersions.sourceFilename, "pfs-round-2.pdf"),
      ),
    );
  await confirmFile(page, dealId, replacement!.id, true);
  const history = await getDb()
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.dealId, dealId), eq(schema.facts.attribute, "pfs.cash")));
  expect(history.some((f) => f.id === fact!.id && !f.isCurrent)).toBe(true);
  expect(
    history.some(
      (f) =>
        f.documentVersionId === fact!.documentVersionId &&
        f.recordVersion > fact!.recordVersion &&
        f.reviewNote?.includes("Rechecking"),
    ),
  ).toBe(true);
  expect(
    history.some(
      (f) =>
        f.documentVersionId === replacement!.id &&
        f.isCurrent &&
        ["accepted", "auto_accepted"].includes(f.routingStatus),
    ),
  ).toBe(true);
});
test("D06 rejects a stale question tab after amended evidence and resolves the reviewed round 3 price", async ({
  page,
  browser,
}) => {
  await login(page);
  await select(page, "D06");
  const dealId = await id("D06");
  const question = (await portalData(dealId)).mapped.questions.find(
    (q) => q.title === "Which purchase price is right?",
  )!;
  expect(question.answered).toBe(true);
  const stale = await browser.newPage();
  await login(stale);
  await stale.goto(`/deals/${dealId}/questions/${question.key}`);
  await stale.waitForLoadState("networkidle");
  await expect(stale.getByRole("heading", { name: question.title })).toBeVisible();
  await stale.getByLabel("900,000", { exact: true }).check();
  await upload(page, dealId, "fixtures/demo/generated/D06/round-2.zip");
  for (const version of await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId)))
    if (version.sourceFilename.includes("round-2")) await confirmFile(page, dealId, version.id);
  await stale.getByRole("button", { name: "Send my answer", exact: true }).click();
  await expect(stale.getByRole("status")).toContainText(/refresh/i);
  const changed = (await portalData(dealId)).mapped.questions.find((q) => q.key === question.key)!;
  expect(changed.answered).toBe(false);
  expect(changed.history).toHaveLength(1);
  await upload(page, dealId, "fixtures/demo/generated/D06/round-3.zip");
  for (const version of await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId)))
    if (version.sourceFilename.includes("round-3")) await confirmFile(page, dealId, version.id);
  expect(
    (await portalData(dealId)).mapped.questions.find((q) => q.key === question.key),
  ).toBeUndefined();
  await stale.close();
});
test("D08 adviser downloads preparation with deferred work; a new price blocker leaves old bytes unchanged", async ({
  page,
  browser,
}) => {
  const dealId = await id("D08");
  // Account provisioning is test setup only; all file preparation and amendments below use screens.
  const [adviser] = await getDb()
    .insert(schema.appUsers)
    .values({
      email: "demo-adviser@example.com",
      displayName: "Synthetic adviser",
      passwordHash: hashPassword("synthetic-adviser-local"),
    })
    .onConflictDoUpdate({
      target: schema.appUsers.email,
      set: { displayName: "Synthetic adviser" },
    })
    .returning();
  await getDb()
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: process.env.DEMO_CASE_WORKSPACE_ID!,
      userId: adviser!.id,
      role: "adviser",
    })
    .onConflictDoNothing();
  await login(page);
  await select(page, "D08");
  await page.goto(`/staff/deals/${dealId}/requirements?show=all`);
  const later = page
    .locator("form")
    .filter({ has: page.locator('input[name="rule_id"][value="LND-01"]') })
    .filter({ has: page.locator('input[name="kind"][value="tracking"]') });
  await later.locator("xpath=ancestor::details[1]").locator("summary").click();
  await later.getByLabel("Tracking state").selectOption("ordered");
  await later
    .getByLabel("tracking reason")
    .fill("Illustrative lender-owned report ordered; explicitly deferred until later.");
  await later.getByRole("button", { name: "Save tracking", exact: true }).click();
  await expect(later.getByRole("status")).toContainText("Saved.");
  await preparation(page, dealId);
  await expect(page.getByText("Credit reports · lender · tracking", { exact: true })).toBeVisible();
  const client = await browser.newPage();
  await login(client, { email: "demo-adviser@example.com", password: "synthetic-adviser-local" });
  await client.goto(`/deals/${dealId}`);
  const firstDownload = client.waitForEvent("download");
  await client.getByRole("link", { name: "Download the lender file", exact: true }).click();
  const first = await firstDownload;
  const old = fs.readFileSync((await first.path())!);
  const archive = await JSZip.loadAsync(old);
  expect(await archive.file("00_Package_Report.html")!.async("string")).toContain(
    "Later lender work",
  );
  await client.reload();
  const historicalUrl = await client
    .getByRole("link", { name: /Download version/ })
    .last()
    .getAttribute("href");
  expect(historicalUrl).toBeTruthy();
  const prior = await client.request.get(historicalUrl!);
  expect(prior.ok()).toBe(true);
  const immutable = await prior.body();
  await upload(page, dealId, "fixtures/demo/generated/D08/round-2.zip");
  await client.reload();
  await expect(client.getByText("The lender file is ready", { exact: true })).toHaveCount(0);
  const retained = await client.request.get(historicalUrl!);
  expect(retained.ok()).toBe(true);
  expect(await retained.body()).toEqual(immutable);
  await client.close();
});
test("D04 keeps the recipient task through review, a signed replacement, and acceptance", async ({
  page,
  browser,
}) => {
  await login(page);
  await select(page, "D04");
  const dealId = await id("D04");
  const [owner] = await getDb()
    .select()
    .from(schema.parties)
    .where(and(eq(schema.parties.dealId, dealId), eq(schema.parties.externalKey, "alex")));
  const task = async () =>
    (await portalData(dealId)).mapped.tasks.find(
      (t) => t.partyId === owner!.id && t.type === "SBA_413",
    )!;
  expect((await task()).state).toBe("With us for review");
  await page.goto(`/deals/${dealId}`);
  await page.waitForLoadState("networkidle");
  const person = page
    .getByRole("heading", { name: owner!.legalName, exact: true })
    .locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," row ")][1]');
  await person.locator("summary").click();
  await person.getByRole("button", { name: /Create.*link/ }).click();
  const link = await person.getByLabel("New personal link").inputValue();
  const borrower = await browser.newPage();
  await borrower.goto(link);
  await expect(borrower.getByRole("heading", { level: 1 })).toBeVisible();
  await borrower.waitForLoadState("networkidle");
  await borrower.reload();
  const [initial] = await getDb()
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.dealId, dealId),
        eq(schema.segments.docType, "SBA_413"),
        eq(schema.segments.partyId, owner!.id),
        eq(schema.segments.isCurrent, true),
      ),
    );
  await confirmFile(page, dealId, initial!.documentVersionId, false);
  await page.goto(`/staff/deals/${dealId}/follow-ups`);
  const message = page
    .locator("section, article, div.card")
    .filter({ has: page.locator("pre").filter({ hasText: /signed|signature/i }) })
    .last();
  if (await message.getByRole("button", { name: "Record as sent", exact: true }).count()) {
    await message.getByRole("button", { name: "Record as sent", exact: true }).click();
    await message.getByRole("button", { name: "Yes, record it", exact: true }).click();
  }
  await borrower.reload();
  expect((await task()).state).toBe("To do");
  await borrower.goto(`${link}/tasks/${(await task()).key}`);
  await borrower.waitForLoadState("networkidle");
  await borrower
    .getByLabel("Choose files")
    .setInputFiles("fixtures/demo/generated/D04/corrections/round-2/pfs-round-2.pdf");
  await borrower.getByRole("button", { name: /Send your document|Replace this file/ }).click();
  await expect.poll(async () => (await task()).state).toBe("With us for review");
  const latest = (
    await getDb()
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.dealId, dealId))
  ).find((v) => v.sourceFilename === "pfs-round-2.pdf")!;
  expect(latest).toBeDefined();
  await confirmFile(page, dealId, latest.id, true);
  const [segment] = await getDb()
    .select()
    .from(schema.segments)
    .where(
      and(eq(schema.segments.documentVersionId, latest.id), eq(schema.segments.isCurrent, true)),
    );
  await page.goto(`/staff/deals/${dealId}/documents/${latest.id}/values/${segment!.id}`);
  await expect(page.getByRole("group", { name: /^Pending / }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  while (await page.getByRole("group", { name: /^Pending / }).count()) {
    const field = page.getByRole("group", { name: /^Pending / }).first();
    const name = (await field.getAttribute("aria-label"))!.replace("Pending ", "");
    await field
      .getByLabel(`Comment ${name}`, { exact: true })
      .fill(
        "Read the signed synthetic replacement and compared this value with its source region.",
      );
    await field.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByRole("group", { name: `Pending ${name}`, exact: true })).toHaveCount(0);
  }
  await borrower.goto(link);
  await expect(borrower.getByRole("heading", { level: 1 })).toBeVisible();
  await borrower.waitForLoadState("networkidle");
  await borrower.reload();
  expect((await task()).state).toBe("Done");
  expect(
    await getDb()
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.id, initial!.documentVersionId)),
  ).toHaveLength(1);
  await borrower.close();
});

test("D02 confirms mixed ranges, excludes unrelated evidence and receives correct periods", async ({
  page,
}) => {
  await login(page);
  await select(page, "D02");
  const dealId = await id("D02");
  const versions = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId));
  const mixed = versions.find((v) => v.sourceFilename === "document.pdf")!;
  await page.goto(`/staff/deals/${dealId}/documents/${mixed.id}`);
  await page.waitForLoadState("networkidle");
  const parties = await getDb()
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, dealId));
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel(`Segment ${i} first page`, { exact: true }).fill(String(2 * i - 1));
    await page.getByLabel(`Segment ${i} last page`, { exact: true }).fill(String(2 * i));
    await page
      .getByLabel(`Segment ${i} type`, { exact: true })
      .selectOption(i === 1 ? "PURCHASE_AGREEMENT" : "OTHER_NOT_REQUIRED");
    await page
      .getByLabel(`Segment ${i} party`, { exact: true })
      .selectOption(parties.find((p) => p.externalKey === ["target", "alex", "bea"][i - 1])!.id);
    await page.getByLabel(`Segment ${i} signed`, { exact: true }).selectOption("true");
    await page.getByLabel(`Segment ${i} dated`, { exact: true }).selectOption("true");
  }
  await page
    .getByLabel("Review note")
    .fill(
      "Checked all six pages: agreement 1–2; Alex supplemental statement 3–4; Bea supplemental statement 5–6. Full official forms are separate.",
    );
  await page.getByRole("button", { name: "Confirm segments", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Filing saved" })).toBeVisible();
  const unrelated = versions.find((v) => v.sourceFilename === "return.pdf")!;
  await page.goto(`/staff/deals/${dealId}/documents/${unrelated.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Segment 1 type", { exact: true }).selectOption("OTHER_NOT_REQUIRED");
  await page
    .getByLabel("Review note")
    .fill(
      "The source names a separate business, Varnholt Climate Parts LLC. Excluded from this acquisition's required evidence.",
    );
  await page.getByRole("button", { name: "Confirm segments", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Filing saved" })).toBeVisible();
  const [assignment] = await getDb()
    .select()
    .from(schema.findings)
    .where(
      and(
        eq(schema.findings.dealId, dealId),
        eq(schema.findings.ruleId, "CON-16"),
        eq(schema.findings.status, "open"),
      ),
    );
  if (assignment) {
    await page.goto(`/staff/deals/${dealId}/review?finding=${assignment.findingKey}`);
    await page
      .getByLabel("Decision reason", { exact: true })
      .fill(
        "The accountant included a return for a separate business. It is explicitly outside this acquisition and retained as OTHER_NOT_REQUIRED, so this assignment finding does not apply.",
      );
    await page.getByRole("button", { name: "Dismiss finding", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  }
  await page.goto(`/staff/deals/${dealId}/follow-ups`);
  await expect(page.getByText(/2025/).first()).toBeVisible();
  const request = page
    .locator("section.card")
    .filter({ has: page.getByRole("button", { name: "Record as sent", exact: true }) })
    .filter({ hasText: "2025" })
    .first();
  await request.getByRole("button", { name: "Record as sent", exact: true }).click();
  await page.getByRole("button", { name: "Yes, record it", exact: true }).click();
  await expect(page.getByText("Recorded message").first()).toBeVisible();
  await upload(page, dealId, "fixtures/demo/generated/D02/round-2.zip");
  for (const version of await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId)))
    if (version.sourceFilename.includes("round-2")) await confirmFile(page, dealId, version.id);
  const remaining = (await portalData(dealId)).mapped.tasks.filter((t) => t.state === "To do");
  expect(
    remaining.filter((t) => t.periods.includes("2025") || t.periods.includes("2026-08")),
  ).toHaveLength(0);
  await preparation(page, dealId);
  await page.getByRole("button", { name: "Create lender-file version", exact: true }).click();
  const zipLink = page.getByRole("link", { name: "Download ZIP", exact: true }).first();
  await expect(zipLink).toBeVisible();
  const zip = await JSZip.loadAsync(
    await (await page.request.get((await zipLink.getAttribute("href"))!)).body(),
  );
  const report = await zip.file("00_Package_Report.html")!.async("string");
  for (const range of ["1–2", "3–4", "5–6"]) expect(report).toContain(range);
});

test("D05 asks specific questions and resolves them from reviewed clarification documents", async ({
  page,
}) => {
  await login(page);
  await select(page, "D05");
  const dealId = await id("D05");
  const questions = (await portalData(dealId)).mapped.questions;
  for (const title of [
    "Which business address should we use?",
    "What is the consulting period?",
    "Can you clarify the lease expiry and renewal options?",
  ]) {
    const question = questions.find((q) => q.title === title)!;
    expect(question).toBeDefined();
    await page.goto(`/deals/${dealId}/questions/${question.key}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (title.includes("lease")) expect(question.kind).toBe("clarification");
  }
  await page.getByLabel("I'm not sure yet", { exact: true }).check();
  await page.getByRole("button", { name: "Send my answer", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`));
  expect(
    (await portalData(dealId)).mapped.questions.find((q) => q.title.includes("lease"))?.answered,
  ).toBe(false);
  await upload(page, dealId, "fixtures/demo/generated/D05/round-2.zip");
  for (const version of await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId)))
    if (version.sourceFilename.includes("round-2") || version.sourceFilename === "consent.pdf")
      await confirmFile(page, dealId, version.id);
  const after = (await portalData(dealId)).mapped.questions;
  expect(after.filter((q) => questions.some((old) => old.key === q.key))).toHaveLength(0);
});

test("D07 retries the real failed job, replaces the protected file and deduplicates retry", async ({
  page,
}) => {
  await login(page);
  await select(page, "D07");
  const dealId = await id("D07");
  await page.goto(`/staff/deals/${dealId}/documents`);
  await page.getByText("Upload history and technical detail", { exact: true }).click();
  await page.getByRole("button", { name: "Retry batch", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry batch", exact: true })).toHaveCount(0);
  await upload(page, dealId, "fixtures/demo/generated/D07/round-2.zip");
  const versions = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId));
  const replacement = versions.find((v) => v.sourceFilename === "formation-round-2.pdf")!;
  await confirmFile(page, dealId, replacement.id);
  const protectedFile = versions.find((v) => v.parseStatus === "failed")!;
  await page.goto(`/staff/deals/${dealId}/documents/${protectedFile.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Segment 1 type", { exact: true }).selectOption("OTHER_NOT_REQUIRED");
  await page
    .getByLabel("Review note")
    .fill(
      "Protected original retained for history; the accessible replacement is the reviewed formation evidence.",
    );
  await page.getByRole("button", { name: "File manually", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Filing saved" })).toBeVisible();
  await upload(page, dealId, "fixtures/demo/generated/D07/round-2.zip");
  expect(
    await getDb()
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.dealId, dealId)),
  ).toHaveLength(versions.length);
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await expect(page.getByText("Prepared for lender review", { exact: true })).toHaveCount(0);
});

test("U01 reaches manual filing and an incomplete export without prepared answers; price entry remains unsupported", async ({
  page,
}) => {
  await login(page);
  await page.goto("/staff/deals/new");
  await page.waitForLoadState("networkidle");
  await page.getByText("Advanced: import a profile", { exact: true }).click();
  await page.getByLabel("Profile JSON").fill(
    JSON.stringify({
      code: `Holdout-U01-${crypto.randomUUID().slice(0, 8)}`,
      name: "Ostrelyva Fitness LLC",
      as_of: "2026-09-15",
      profile: {
        transaction_category: "initial_acquisition",
        structure: "asset",
        purchase_price: 780000,
        total_project_cost: 900000,
        real_estate_included: "no",
        premises: "none",
        franchise: "no",
        franchise_brand: "unknown",
        seller_note: "unknown",
        gift_funds: "unknown",
        minority_investor_equity: "unknown",
        seller_staying: "unknown",
        target_lender: "unknown",
        expected_loan_number_date: "2026-09-15",
        target_submission_date: "unknown",
        paid_agents: [],
        equity_sources: "unknown",
      },
      parties: [
        {
          id: "buyer",
          kind: "entity",
          roles: ["buyer_entity"],
          legal_name: "Quenby Acquisition LLC",
        },
        {
          id: "target",
          kind: "entity",
          roles: ["seller_entity"],
          legal_name: "Ostrelyva Fitness LLC",
        },
      ],
      ownership: [],
    }),
  );
  await page.getByRole("button", { name: "Load JSON", exact: true }).click();
  await page.getByRole("button", { name: "Save deal", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/deals\/[a-f0-9-]+$/);
  const dealId = page.url().split("/").at(-1)!;
  await page.goto(`/staff/deals/${dealId}/documents`);
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Files or ZIP")
    .setInputFiles(
      ["signed-copy.pdf", "tax-copy.pdf", "IMG_042.pdf", "book2.xlsx"].map(
        (f) => `fixtures/holdout/U01/${f}`,
      ),
    );
  await page.getByRole("button", { name: "Upload batch", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Batch \d+: 4 files received/ }),
  ).toBeVisible();
  const versions = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, dealId));
  const parties = await getDb()
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, dealId));
  for (const [filename, type, party, period] of [
    ["signed-copy.pdf", "PURCHASE_AGREEMENT", "target", ""],
    ["tax-copy.pdf", "TAX_BUSINESS", "target", "2024"],
    ["book2.xlsx", "SOURCES_USES", "buyer", ""],
  ]) {
    const v = versions.find((v) => v.sourceFilename === filename)!;
    await page.goto(`/staff/deals/${dealId}/documents/${v.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Segment 1 type", { exact: true }).selectOption(type!);
    await page
      .getByLabel("Segment 1 party", { exact: true })
      .selectOption(parties.find((p) => p.externalKey === party)!.id);
    await page.getByLabel("Segment 1 period", { exact: true }).fill(period!);
    await page
      .getByLabel("Review note")
      .fill(
        "Manually inspected the unfamiliar synthetic source and assigned its document type, subject and stated period. No prepared extraction lookup.",
      );
    await page.getByRole("button", { name: "Confirm segments", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Filing saved" })).toBeVisible();
  }
  const agreement = versions.find((v) => v.sourceFilename === "signed-copy.pdf")!;
  const [segment] = await getDb()
    .select()
    .from(schema.segments)
    .where(
      and(eq(schema.segments.documentVersionId, agreement.id), eq(schema.segments.isCurrent, true)),
    );
  await page.goto(`/staff/deals/${dealId}/documents/${agreement.id}/values/${segment!.id}`);
  await expect(page.getByRole("heading", { name: "Open items", exact: true })).toBeVisible();
  // The current generic fallback only creates rule-required presence gaps here, not a price-entry control.
  // Preserve this observed limitation; do not insert the missing fact in test setup or use an answer key.
  await expect(
    page.getByRole("group", { name: "Gap deal.purchase_price", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Decided values", exact: true })).toBeVisible();
  await page.goto(`/staff/deals/${dealId}/lender-file`);
  await page
    .getByRole("button", { name: "Create a version while work is outstanding", exact: true })
    .click();
  await page.getByRole("button", { name: "Create version anyway", exact: true }).click();
  const link = page.getByRole("link", { name: "Download ZIP", exact: true });
  await expect(link).toBeVisible();
  const zip = await JSZip.loadAsync(
    await (await page.request.get((await link.getAttribute("href"))!)).body(),
  );
  const report = await zip.file("00_Package_Report.html")!.async("string");
  expect(report).toContain("Ostrelyva Fitness LLC");
  expect(report).toContain("Unresolved preparation work");
  expect(report).toContain("2025");
  expect((await portalData(dealId)).mapped.ready).toBe(false);
});
