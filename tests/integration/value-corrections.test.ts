import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import { buildEngineInput, latestEvaluation, requestEvaluation } from "@/lib/evaluation/run";
import { fixtureDeal, unlimited } from "../helpers/deal-proof";
import { seeded, makePdf } from "./helpers";
import { intake } from "@/lib/deals/intake";
import { parseArrival } from "@/lib/deals/parse";
import { FACTS } from "@/lib/domain/registry";
import { SAMPLE_HMAC_KEY } from "@/lib/config/sample";
import type { SessionContext } from "@/lib/workspace";
let ctx: SessionContext,
  viewer: SessionContext,
  dealId: string,
  versionId: string,
  segmentId: string;
const source = { page: 2, quote: "Corrected purchase price: $25,000.50", kind: "quote" };
const db = () => getDb();
beforeAll(async () => {
  process.env.PII_HMAC_KEY = SAMPLE_HMAC_KEY;
  const seed = await seeded();
  ctx = {
    user: { id: seed.reviewerId, email: "reviewer@example.com", displayName: "Operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "reviewer" },
  };
  viewer = {
    ...ctx,
    user: { ...ctx.user, id: seed.viewerId },
    workspace: { ...ctx.workspace, role: "viewer" },
  };
  const deal = await fixtureDeal(ctx, "deal-a", "Corrections");
  dealId = deal.id;
  const bytes = await makePdf(
    [
      "SYNTHETIC",
      "Corrected purchase price: $25,000.50",
      "Owners: Alex 60%, Bea 40%",
      "Funding: Cash $25000.50",
    ],
    2,
  );
  const uploaded = await intake(ctx, dealId, [{ path: "correction-proof.pdf", bytes }]);
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
      pageEnd: 2,
      docType: "LOI",
      classificationMethod: "manual",
      classificationConfidence: "1",
      status: "confirmed",
    })
    .returning();
  segmentId = segment!.id;
});
async function fact(
  attribute = "deal.purchase_price",
  value: unknown = 24000,
  routingStatus = "auto_accepted",
) {
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
      routingStatus,
      recordVersion: 1,
    })
    .returning();
  return row!;
}
it("corrects autoaccepted, accepted and rejected values with source history, recalculation and reopen", async () => {
  let current = await fact();
  for (const status of ["auto_accepted", "accepted", "rejected"]) {
    if (status === "rejected") {
      const rejected = await reviewFact(ctx, dealId, {
        fact_id: current.id,
        expected_record_version: current.recordVersion,
        action: "reject",
        comment: "Evidence is under review",
      });
      current = (
        await db().select().from(schema.facts).where(eq(schema.facts.id, rejected.factId))
      )[0]!;
    }
    expect(current.routingStatus).toBe(status);
    await requestEvaluation(dealId);
    const before = await latestEvaluation(dealId);
    await unlimited();
    const saved = await reviewFact(ctx, dealId, {
      fact_id: current.id,
      expected_record_version: current.recordVersion,
      action: "edit_accept",
      value: "$25,000.50",
      source,
      comment: "Corrected from page two",
    });
    const old = (await db().select().from(schema.facts).where(eq(schema.facts.id, current.id)))[0]!;
    expect(old.isCurrent).toBe(false);
    expect(old.valueJson).toEqual(current.valueJson);
    expect(old.locatorJson).toEqual(current.locatorJson);
    const event = (
      await db().select().from(schema.events).where(eq(schema.events.id, saved.eventId))
    )[0]!;
    expect(event.actorId).toBe(ctx.user.id);
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.maskedBefore).toMatchObject({
      value: current.valueJson,
      source: current.locatorJson,
    });
    expect(event.maskedAfter).toMatchObject({
      value: 25000.5,
      source: { page: 2, quote: source.quote },
      comment: "Corrected from page two",
    });
    current = (await db().select().from(schema.facts).where(eq(schema.facts.id, saved.factId)))[0]!;
    expect(current.locatorJson).toMatchObject({
      file: versionId,
      page: 2,
      source_block: "page-2",
      verbatim: true,
    });
    expect((await latestEvaluation(dealId))!.id).not.toBe(before!.id);
    expect(
      (await buildEngineInput(dealId)).input.accepted_facts.some((f) => f.id === current.id),
    ).toBe(true);
  }
  const reopened = await reviewFact(ctx, dealId, {
    fact_id: current.id,
    expected_record_version: current.recordVersion,
    action: "reopen",
    comment: "Recheck source",
  });
  const input = (await buildEngineInput(dealId)).input;
  expect(input.accepted_facts.some((f) => f.id === current.id || f.id === reopened.factId)).toBe(
    false,
  );
  expect(input.pending_facts.some((f) => f.id === reopened.factId)).toBe(true);
});
it("validates table corrections and gap entry on the server", async () => {
  const owners = await fact("ownership.members", [{ name: "Alex", percent: 100 }]);
  const save = (value: unknown) =>
    reviewFact(ctx, dealId, {
      fact_id: owners.id,
      expected_record_version: 1,
      action: "edit_accept",
      value,
      source: { ...source, quote: "Owners: Alex 60%, Bea 40%" },
      comment: "Read ownership rows",
    });
  await expect(
    save([
      { name: "Alex", percent: 90 },
      { name: "Bea", percent: 90 },
    ]),
  ).rejects.toThrow("owners_over_100");
  await expect(save([{ name: "Alex", percent: "" }])).rejects.toThrow();
  await save([
    { name: "Alex", percent: 60 },
    { name: "Bea", percent: 40 },
  ]);
  const funding = await fact("funding.sources", [{ label: "Cash", amount: 25000.5 }]);
  const fundingSave = (value: unknown) =>
    reviewFact(ctx, dealId, {
      fact_id: funding.id,
      expected_record_version: 1,
      action: "edit_accept",
      value,
      source,
      comment: "Read funding",
    });
  await expect(fundingSave([{ label: "Cash", amount: "25,00" }])).rejects.toThrow();
  await expect(fundingSave([{ label: "Cash", amount: 50.001 }])).rejects.toThrow(
    "funding_amount_invalid",
  );
  await fundingSave([{ label: "Cash", amount: "$25,000.50" }]);
  const [gap] = await db()
    .insert(schema.intakeReviews)
    .values({
      dealId,
      documentVersionId: versionId,
      segmentId,
      attribute: "funding.uses",
      type: "extraction_gap",
      reason: "Read rows",
    })
    .returning();
  const enter = (value: unknown) =>
    resolveGap(ctx, dealId, {
      review_id: gap!.id,
      action: "enter",
      value,
      source,
      comment: "Read uses",
    });
  await expect(enter([{ label: "Purchase", amount: "N/A" }])).rejects.toThrow();
  await enter([{ label: "Purchase", amount: 25000.5 }]);
  const rows = await db()
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.segmentId, segmentId), eq(schema.facts.isCurrent, true)));
  expect(rows.find((r) => r.attribute === "ownership.members")!.valueJson).toEqual([
    { name: "Alex", percent: 60 },
    { name: "Bea", percent: 40 },
  ]);
});
it("rejects bad source references, read-only roles, and concurrent stale edits", async () => {
  const row = await fact("pfs.cash");
  const input = {
    fact_id: row.id,
    expected_record_version: 1,
    action: "edit_accept",
    value: 25000.5,
    source,
    comment: "Source correction",
  };
  await expect(
    reviewFact(ctx, dealId, { ...input, source: { ...source, page: 3 } }),
  ).rejects.toThrow("outside");
  await expect(
    reviewFact(ctx, dealId, { ...input, source: { ...source, quote: "not in this document" } }),
  ).rejects.toThrow("Quote");
  await expect(reviewFact(viewer, dealId, input)).rejects.toThrow();
  await expect(reviewFact(viewer, dealId, { ...input, action: "reopen" })).rejects.toThrow();
  await unlimited();
  const results = await Promise.allSettled([
    reviewFact(ctx, dealId, input),
    reviewFact(ctx, dealId, input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason),
  ).toContain("Stale");
});
