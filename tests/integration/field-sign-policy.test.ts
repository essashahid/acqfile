import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { intake } from "@/lib/deals/intake";
import { parseArrival } from "@/lib/deals/parse";
import { FACTS } from "@/lib/domain/registry";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import { SAMPLE_HMAC_KEY } from "@/lib/config/sample";
import type { SessionContext } from "@/lib/workspace";
import { fixtureDeal } from "../helpers/deal-proof";
import { makePdf, seeded } from "./helpers";

let ctx: SessionContext;
let dealId: string;
let segmentId: string;
let versionId: string;
const source = { page: 1, quote: "SYNTHETIC", kind: "quote" as const };
const db = () => getDb();

beforeAll(async () => {
  process.env.PII_HMAC_KEY = SAMPLE_HMAC_KEY;
  const seed = await seeded();
  ctx = {
    user: { id: seed.reviewerId, email: "reviewer@example.com", displayName: "Operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "reviewer" },
  };
  dealId = (await fixtureDeal(ctx, "deal-a", "SignValidation")).id;
  const bytes = await makePdf(["SYNTHETIC", "Sign policy source"], 1);
  const uploaded = await intake(ctx, dealId, [{ path: "sign-policy.pdf", bytes }]);
  versionId = uploaded.rows[0]!.documentVersionId;
  const parsed = await parseArrival(bytes, SAMPLE_HMAC_KEY);
  await db().insert(schema.runSteps).values({
    processingRunId: uploaded.runId,
    documentVersionId: versionId,
    stepName: "parse",
    idempotencyKey: randomUUID(),
    status: "succeeded",
    outputJson: parsed,
  });
  const [segment] = await db()
    .insert(schema.segments)
    .values({
      dealId,
      documentVersionId: versionId,
      metadataLocator: { file: versionId, page: 1, source_block: "page-1", quote: "SYNTHETIC" },
      pageStart: 1,
      pageEnd: 1,
      docType: "LOI",
      classificationMethod: "manual",
      classificationConfidence: "1",
      status: "confirmed",
    })
    .returning();
  segmentId = segment!.id;
});

async function fact(attribute: string, value: unknown) {
  const [row] = await db()
    .insert(schema.facts)
    .values({
      dealId,
      segmentId,
      documentVersionId: versionId,
      attribute,
      valueJson: value,
      normalizedValueJson: value,
      unit: FACTS[attribute]!.unit,
      method: "text",
      locatorJson: { file: versionId, page: 1, source_block: "page-1", quote: "SYNTHETIC" },
      confidence: "0.9",
      confidenceComponents: {},
      validatorsPassed: true,
      routingStatus: "review",
      recordVersion: 1,
    })
    .returning();
  return row!;
}

const edit = (id: string, value: unknown) =>
  reviewFact(ctx, dealId, {
    fact_id: id,
    expected_record_version: 1,
    action: "edit_accept",
    value,
    source,
    comment: "Verified against source",
  });

it("keeps negative purchase prices and funding rows unresolved through fact review", async () => {
  const purchase = await fact("deal.purchase_price", 25000);
  await expect(edit(purchase.id, "($25,000)")).rejects.toThrow("negative_not_allowed");
  expect(
    await db().select().from(schema.facts).where(eq(schema.facts.id, purchase.id)),
  ).toMatchObject([{ isCurrent: true, routingStatus: "review", valueJson: 25000 }]);
  const negativeExtracted = await fact("deal.loan_requested", -25000);
  await expect(
    reviewFact(ctx, dealId, {
      fact_id: negativeExtracted.id,
      expected_record_version: 1,
      action: "accept",
      comment: "Attempted acceptance",
    }),
  ).rejects.toThrow("negative_not_allowed");
  const funding = await fact("funding.sources", [{ label: "Cash", amount: 25000 }]);
  await expect(edit(funding.id, [{ label: "Cash", amount: -25000 }])).rejects.toThrow(
    "negative_not_allowed",
  );
  expect(
    await db().select().from(schema.facts).where(eq(schema.facts.id, funding.id)),
  ).toMatchObject([{ isCurrent: true, routingStatus: "review", validatorsPassed: true }]);
});

it("rejects negative gap entry, permits actual zero, and keeps signed accounting facts", async () => {
  const [gap] = await db()
    .insert(schema.intakeReviews)
    .values({
      dealId,
      documentVersionId: versionId,
      segmentId,
      attribute: "funding.uses",
      type: "extraction_gap",
      reason: "Read uses",
    })
    .returning();
  const enter = (value: unknown) =>
    resolveGap(ctx, dealId, {
      review_id: gap!.id,
      action: "enter",
      value,
      source,
      comment: "Verified uses",
    });
  await expect(enter([{ label: "Purchase", amount: -1 }])).rejects.toThrow("negative_not_allowed");
  expect(
    await db().select().from(schema.intakeReviews).where(eq(schema.intakeReviews.id, gap!.id)),
  ).toMatchObject([{ status: "open" }]);
  await enter([{ label: "Purchase", amount: 0 }]);
  const [zero] = await db()
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.segmentId, segmentId), eq(schema.facts.attribute, "funding.uses")));
  expect(zero).toMatchObject({
    valueJson: [{ label: "Purchase", amount: 0 }],
    routingStatus: "accepted",
    validatorsPassed: true,
  });
  for (const attribute of ["tax.net_income", "pfs.net_worth", "bank.ending_balance"]) {
    const row = await fact(attribute, 100);
    const saved = await edit(row.id, -25);
    const [current] = await db()
      .select()
      .from(schema.facts)
      .where(eq(schema.facts.id, saved.factId));
    expect(current).toMatchObject({
      valueJson: -25,
      routingStatus: "accepted",
      validatorsPassed: true,
    });
  }
});
