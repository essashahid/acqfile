import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { login } from "./helpers";
import { and, eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "../../src/lib/db/client";
import { parsedVersion } from "../../src/lib/deals/blocks";
import type { seedPortal } from "../../scripts/seed-portal";
// Same isolated database as the browser server; this test does not reprocess the file.
process.env.ACQFILE_DB = "test";
test.afterAll(closeDb);
test("operator corrects a decided value with source and reason, then sees history without reprocessing", async ({
  page,
}) => {
  const seeded = JSON.parse(fs.readFileSync("/tmp/acqfile-browser-deals.json", "utf8")) as Awaited<
    ReturnType<typeof seedPortal>
  >;
  const dealId = seeded["deal-a"]!.id;
  const [fact] = await getDb()
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.attribute, "deal.purchase_price"),
        eq(schema.facts.isCurrent, true),
        eq(schema.facts.routingStatus, "auto_accepted"),
      ),
    );
  expect(fact).toBeDefined();
  const corrected = Number(fact!.valueJson);
  // Arrange one misread accepted value; the supplied document and its original bytes stay untouched.
  await getDb()
    .update(schema.facts)
    .set({ valueJson: corrected - 100, normalizedValueJson: corrected - 100 })
    .where(eq(schema.facts.id, fact!.id));
  const source = fact!.locatorJson as { page: number; quote: string; source_block: string };
  const parsed = await parsedVersion(fact!.documentVersionId!);
  expect(parsed!.blocks.some((b) => b.locator === source.source_block)).toBe(true);
  const runsBefore = await getDb()
    .select({ id: schema.runSteps.id })
    .from(schema.runSteps)
    .where(eq(schema.runSteps.documentVersionId, fact!.documentVersionId!));
  await login(page, { email: "reviewer@example.com", password: "acqfile-reviewer" });
  await page.goto(
    `/staff/deals/${dealId}/documents/${fact!.documentVersionId}/values/${fact!.segmentId}`,
  );
  const decision = page.getByRole("group", { name: "Decision deal.purchase_price", exact: true });
  await decision.getByRole("button", { name: "Correct value", exact: true }).click();
  await decision
    .getByLabel("Edit value deal.purchase_price", { exact: true })
    .fill(String(corrected));
  await decision
    .getByLabel("Supporting page deal.purchase_price", { exact: true })
    .fill(String(source.page));
  await decision
    .getByLabel("Source text type deal.purchase_price", { exact: true })
    .selectOption("quote");
  await decision.getByLabel("Source quote deal.purchase_price", { exact: true }).fill(source.quote);
  await decision
    .getByLabel("Decision reason deal.purchase_price", { exact: true })
    .fill("Corrected the recorded amount after reviewing the source");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await decision.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decision saved" })).toContainText(
    "Decision saved",
  );
  await expect(
    page
      .getByText(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        }).format(corrected),
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  const [saved] = await getDb()
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.segmentId, fact!.segmentId),
        eq(schema.facts.attribute, fact!.attribute),
        eq(schema.facts.isCurrent, true),
      ),
    );
  expect(saved!.valueJson).toBe(corrected);
  expect(saved!.recordVersion).toBe(fact!.recordVersion + 1);
  expect(saved!.locatorJson).toMatchObject({ verbatim: true, quote: source.quote });
  await page.getByText(/Earlier value records/).click();
  await page.screenshot({ path: "/tmp/acqfile-fix01-correction.png", fullPage: true });
  await expect(page.getByRole("heading", { name: "Value history" })).toBeVisible();
  expect(
    await getDb()
      .select({ id: schema.runSteps.id })
      .from(schema.runSteps)
      .where(eq(schema.runSteps.documentVersionId, fact!.documentVersionId!)),
  ).toEqual(runsBefore);
});
