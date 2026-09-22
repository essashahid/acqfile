import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "../../src/lib/db/client";
import { login } from "./helpers";
import type { seedPortal } from "../../scripts/seed-portal";

process.env.ACQFILE_DB = "test";
test.afterAll(closeDb);

test("a negative purchase price correction stays in review", async ({ page }) => {
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
  const source = fact!.locatorJson as { page: number; quote: string };
  await login(page, { email: "reviewer@example.com", password: "acqfile-reviewer" });
  await page.goto(
    `/staff/deals/${dealId}/documents/${fact!.documentVersionId}/values/${fact!.segmentId}`,
  );
  const decision = page.getByRole("group", { name: "Decision deal.purchase_price", exact: true });
  await decision.getByRole("button", { name: "Correct value", exact: true }).click();
  await decision.getByLabel("Edit value deal.purchase_price", { exact: true }).fill("($25,000)");
  await decision
    .getByLabel("Supporting page deal.purchase_price", { exact: true })
    .fill(String(source.page));
  await decision.getByLabel("Source quote deal.purchase_price", { exact: true }).fill(source.quote);
  await decision
    .getByLabel("Decision reason deal.purchase_price", { exact: true })
    .fill("Checking the sign against the source");
  await decision.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "negative_not_allowed" })).toBeVisible();
  const [current] = await getDb().select().from(schema.facts).where(eq(schema.facts.id, fact!.id));
  expect(current).toMatchObject({
    isCurrent: true,
    valueJson: fact!.valueJson,
    routingStatus: "auto_accepted",
    recordVersion: fact!.recordVersion,
  });
});
