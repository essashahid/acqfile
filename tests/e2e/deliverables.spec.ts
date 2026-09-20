import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { login } from "./helpers";
import { customerBanned } from "../../src/lib/portal/copy";
import type { seedPortal } from "../../scripts/seed-portal";
const deals = (): Awaited<ReturnType<typeof seedPortal>> =>
  JSON.parse(fs.readFileSync("/tmp/acqfile-browser-deals.json", "utf8"));
const shots = "docs/screenshots/phase-7";
async function customerProof(page: Page) {
  const text = await page.locator(".portal").evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[data-evidence]").forEach((n) => n.remove());
    return copy.textContent ?? "";
  });
  expect(text).not.toMatch(customerBanned);
  expect(text).not.toMatch(/AcqFile|[a-f0-9]{64}|\b[0-9a-f]{8}-[0-9a-f-]{27,}|\d+%/i);
  await expect(
    page.locator('.portal table,.portal [role="tab"],.portal [role="progressbar"]'),
  ).toHaveCount(0);
  await expect(
    page.getByText("This is a demonstration with sample data.", { exact: true }),
  ).toHaveCount(1);
  const unlabelled = await page
    .locator('.portal input:not([type="hidden"]),.portal textarea,.portal select')
    .evaluateAll(
      (nodes) =>
        nodes.filter((n) => {
          const e = n as HTMLInputElement;
          return !(
            e.labels?.length ||
            e.getAttribute("aria-label") ||
            e.getAttribute("aria-labelledby")
          );
        }).length,
    );
  expect(unlabelled).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function screenshots(page: Page, name: string) {
  const headings: Record<string, RegExp> = {
    PortalHome: /^Hi Kiel/,
    PortalHomePhone: /^Hi Kiel/,
    PortalWaiting: /^Nothing for you to do/,
    PortalDone: /^You're all done/,
    PortalUpload: /^Your 2024 personal tax return$/,
    PortalTaskFiles: /^Your bank statements$/,
    PortalCantSend: /^Can't send this right now\?$/,
    PortalChecking: /^We're reading your document$/,
    PortalChecked: /^Thanks, Kiel. One small thing.$/,
    ClientOverview: /^Varnholt Climate Services LLC$/,
    QuestionForYou: /^Which purchase price is right\?$/,
  };
  await expect(page.getByRole("heading", { level: 1, name: headings[name]! })).toBeVisible();
  fs.mkdirSync(shots, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await customerProof(page);
    await page.screenshot({
      path: `${shots}/${name}-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
}
const fixture = (
  predicate: (d: {
    batch: number;
    segments: { doc_type: string; party_id: string; period: string }[];
  }) => boolean,
) => {
  const docs = JSON.parse(fs.readFileSync("fixtures/deals/deal-a/truth/documents.json", "utf8"));
  return path.resolve("fixtures/deals/deal-a", docs.find(predicate).file);
};
test("Kiel uploads the wrong year, sees a gentle note and sends the correction", async ({
  page,
  request,
}) => {
  const a = deals()["deal-a"]!,
    person = a.people.find((p) => p.name.startsWith("Kiel"))!,
    base = `/p/${person.token}`;
  const tax = person.tasks.find((t) => t.type === "TAX_PERSONAL" && t.periods.includes("2024"))!;
  const response = await page.goto(base);
  expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response!.headers()["x-robots-tag"]).toBe("noindex");
  await expect(page.getByRole("heading", { name: /Hi Kiel/ })).toBeVisible();
  await screenshots(page, "PortalHome");
  await screenshots(page, "PortalHomePhone");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineWidth)).toBe(
    "3px",
  );
  const other = a.people.find((p) => p.name.startsWith("Jaylan"))!;
  expect((await request.get(`${base}/tasks/${other.tasks[0]!.key}`)).status()).toBe(404);
  for (const route of [`/deals/${a.id}`, `/staff/deals/${a.id}`, `/staff/rulepacks`]) {
    const res = await request.get(route, { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
    expect(res.headers().location).toContain("/login");
  }
  await page.goto(`${base}/tasks/${tax.key}`);
  await screenshots(page, "PortalUpload");
  await page.getByRole("link", { name: "I can't send this right now" }).click();
  await screenshots(page, "PortalCantSend");
  await page.getByLabel("I'll send it later", { exact: false }).first().check();
  await page.getByLabel("Expected date").fill("2026-10-01");
  await page.getByLabel("Add a few words").fill("My accountant is preparing a copy.");
  await page.getByRole("button", { name: /^Tell / }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByText(/You plan to send this by 1 October/)).toBeVisible();
  const bank = person.tasks.find((t) => t.type === "BANK_STATEMENT")!;
  await page.goto(`${base}/tasks/${bank.key}`);
  await screenshots(page, "PortalTaskFiles");
  // Warm the real result route before the upload, without creating a screen state.
  await page.goto(`${base}/uploads/00000000-0000-0000-0000-000000000000`);
  await page.goto(`${base}/tasks/${tax.key}`);
  const source = await PDFDocument.load(
    fs.readFileSync(
      fixture((d) =>
        d.segments.some(
          (s) => s.doc_type === "TAX_PERSONAL" && s.party_id === "alex" && s.period === "2023",
        ),
      ),
    ),
  );
  const single = await PDFDocument.create();
  single.addPage((await single.copyPages(source, [0]))[0]!);
  single.setSubject("A separate copy sent through the portal");
  await page.getByLabel("Choose files").setInputFiles({
    name: "My return.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await single.save()),
  });
  await page.route("**/uploads/*/status", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.getByRole("button", { name: "Send your document", exact: true }).click();
  await expect(page).toHaveURL(/\/uploads\//);
  await expect(
    page.getByRole("heading", { name: "We're reading your document", exact: true }),
  ).toBeVisible();
  await screenshots(page, "PortalChecking");
  await expect(page.getByRole("heading", { name: "Thanks, Kiel. One small thing." })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText(/This is your 2023 document/)).toBeVisible();
  await screenshots(page, "PortalChecked");
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("link", { name: "Upload another copy" }).click();
  await page
    .getByLabel("Choose files")
    .setInputFiles(
      fixture((d) => d.batch === 2 && d.segments.some((s) => s.doc_type === "TAX_PERSONAL")),
    );
  await page.getByRole("button", { name: "Send your document", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your document is with us for review" }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "Back to your list", exact: true }).click();
  await customerProof(page);
});
test("the adviser sees three prices, answers once and can manage scoped links", async ({
  page,
}) => {
  const a = deals()["deal-a"]!,
    person = a.people.find((p) => p.name.startsWith("Jaylan"))!;
  await login(page, { email: "adviser@example.com", password: "acqfile-adviser" });
  await customerProof(page);
  await page.goto(`/deals/${a.id}`);
  await expect(page.getByText("My accountant is preparing a copy.")).toBeVisible();
  await screenshots(page, "ClientOverview");
  const questions = await page
    .locator('a[href*="/questions/"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")!));
  for (const question of questions) {
    await page.goto(question);
    await customerProof(page);
  }
  await page.goto(`/deals/${a.id}`);
  await page
    .locator(".row")
    .filter({ has: page.getByRole("heading", { name: "Which purchase price is right?" }) })
    .getByRole("link", { name: "Answer" })
    .click();
  await screenshots(page, "QuestionForYou");
  for (const price of ["2,400,000", "2,410,000", "2,425,000"])
    await expect(page.getByRole("radio", { name: price, exact: true })).toBeVisible();
  const source = page.getByRole("link", { name: "See the page" }).first();
  const opened = await page.request.get((await source.getAttribute("href"))!);
  expect(opened.status()).toBe(200);
  await page.getByRole("radio", { name: "2,400,000", exact: true }).check();
  await page.getByRole("button", { name: "Send my answer" }).click();
  await expect(page).toHaveURL(`/deals/${a.id}`);
  await expect(page.getByRole("heading", { name: "Which purchase price is right?" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "See every document" }).click();
  await customerProof(page);
  await expect(page.getByText(/Please send a corrected copy/).first()).toBeVisible();
  await page.goto(`/staff/deals/${a.id}`);
  await expect(page).toHaveURL("/deals");
  await page.goto(`/deals/${a.id}`);
  const row = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "People", exact: true }) })
    .locator(":scope > .row")
    .filter({ has: page.getByRole("heading", { name: person.name, exact: true }) });
  await row.locator("summary").click();
  await expect(row.getByText(/Last reminder/)).toHaveCount(0);
  await row.getByRole("button", { name: "I sent it", exact: true }).click();
  await expect(row.getByText(/Last reminder/)).toBeVisible();
  await row.getByRole("button", { name: "Turn off this link" }).click();
  await expect.poll(async () => (await page.request.get(`/p/${person.token}`)).status()).toBe(404);
});
test("Abe waits for review and Terrill sees all done on a phone", async ({ page }) => {
  const b = deals()["deal-b"]!,
    waiting = b.people.find((p) => p.state === "waiting")!,
    done = b.people.find((p) => p.name.startsWith("Terrill"))!;
  await page.goto(`/p/${waiting.token}`);
  await expect(
    page.getByRole("heading", { name: /Nothing for you to do right now/ }),
  ).toBeVisible();
  await screenshots(page, "PortalWaiting");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/p/${done.token}`);
  await expect(
    page.getByRole("heading", { name: /You're all done for now, Terrill/ }),
  ).toBeVisible();
  await screenshots(page, "PortalDone");
  await expect(page.getByText(/decision on the loan belongs to the lender/)).toBeVisible();
});
