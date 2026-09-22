import { beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { reviewFact } from "@/lib/extract/review";
import { requestEvaluation } from "@/lib/evaluation/run";
import { answerQuestion, portalData, recordResponse, resolvePortal } from "@/lib/portal/service";
import { seedPortal } from "../../scripts/seed-portal";
import { unlimited } from "../helpers/deal-proof";
import type { SessionContext } from "@/lib/workspace";

let ctx: SessionContext;
let dealId: string;
const db = () => getDb();
const priceQuestion = async () =>
  (await portalData(dealId)).mapped.questions.find(
    (question) => question.title === "Which purchase price is right?",
  );

beforeAll(async () => {
  const seeded = await seedPortal();
  dealId = seeded["deal-a"]!.id;
  const person = seeded["deal-a"]!.people.find((entry) => entry.name.startsWith("Kiel"))!;
  ctx = (await resolvePortal(person.token))!.ctx;
}, 180000);

async function confirmSameValue(attribute: string, value: number) {
  const all = await portalData(dealId);
  const fact = all.data.facts.find(
    (item) => item.attribute === attribute && Number(item.valueJson) === value,
  )!;
  const locator = fact.locatorJson as { page: number; quote: string; verbatim?: boolean };
  await unlimited();
  await reviewFact(ctx, dealId, {
    fact_id: fact.id,
    expected_record_version: fact.recordVersion,
    action: "edit_accept",
    value,
    source: {
      page: locator.page,
      quote: locator.quote,
      kind: locator.verbatim === false ? "transcription" : "quote",
      region: "purchase price",
    },
    comment: "Confirmed the amount against the current document.",
  });
}

it("keeps valid answers on identical reevaluation and reopens them after relevant review", async () => {
  const question = (await priceQuestion())!;
  expect(question.values).toContain("2,400,000");
  await expect(
    answerQuestion(ctx, dealId, question.key, "2,400,000", "Prior tab", "old-page-key"),
  ).rejects.toThrow("refresh");
  await answerQuestion(
    ctx,
    dealId,
    question.key,
    "2,400,000",
    "Confirmed with the seller.",
    question.evidenceKey,
  );
  expect((await priceQuestion())!.answered).toBe(true);
  await requestEvaluation(dealId);
  expect((await priceQuestion())!.answered).toBe(true);
  await confirmSameValue("deal.purchase_price", 2400000);
  const changed = (await priceQuestion())!;
  expect(changed.answered).toBe(false);
  expect(changed.evidenceKey).not.toBe(question.evidenceKey);
  expect(changed.history).toHaveLength(1);
  await expect(
    answerQuestion(ctx, dealId, changed.key, "2,400,000", "From a stale tab", question.evidenceKey),
  ).rejects.toThrow("refresh");
  await recordResponse(ctx, dealId, null, changed.key, "answer", {
    choice: "2,400,000",
    note: "Answer recorded before evidence keys existed.",
  });
  expect((await priceQuestion())!.answered).toBe(false);
  expect((await priceQuestion())!.history).toHaveLength(2);
  await answerQuestion(
    ctx,
    dealId,
    changed.key,
    "2,400,000",
    "Current answer",
    changed.evidenceKey,
  );
  expect((await priceQuestion())!.answered).toBe(true);
  await requestEvaluation(dealId);
  expect((await priceQuestion())!.answered).toBe(true);
});

it("a simultaneous staff correction leaves an old-tab answer historical; a resolved comparison closes", async () => {
  await confirmSameValue("deal.purchase_price", 2410000);
  const beforeRace = (await priceQuestion())!;
  expect(beforeRace.answered).toBe(false);
  const all = await portalData(dealId);
  const fact = all.data.facts.find(
    (item) => item.attribute === "deal.purchase_price" && Number(item.valueJson) === 2425000,
  )!;
  const locator = fact.locatorJson as { page: number; quote: string; verbatim?: boolean };
  await unlimited();
  const race = await Promise.allSettled([
    answerQuestion(
      ctx,
      dealId,
      beforeRace.key,
      "2,400,000",
      "The older page was still open.",
      beforeRace.evidenceKey,
    ),
    reviewFact(ctx, dealId, {
      fact_id: fact.id,
      expected_record_version: fact.recordVersion,
      action: "edit_accept",
      value: 2425000,
      source: {
        page: locator.page,
        quote: locator.quote,
        kind: locator.verbatim === false ? "transcription" : "quote",
        region: "purchase price",
      },
      comment: "Confirmed while another page was open.",
    }),
  ]);
  expect(race[1]!.status).toBe("fulfilled");
  await requestEvaluation(dealId);
  const current = (await priceQuestion())!;
  expect(current.answered).toBe(false);
  expect(current.evidenceKey).not.toBe(beforeRace.evidenceKey);
  for (const wrong of [2410000, 2425000]) {
    const latest = await portalData(dealId);
    const rejected = latest.data.facts.find(
      (item) => item.attribute === "deal.purchase_price" && Number(item.valueJson) === wrong,
    )!;
    await unlimited();
    await reviewFact(ctx, dealId, {
      fact_id: rejected.id,
      expected_record_version: rejected.recordVersion,
      action: "reject",
      comment: "This amount is not supported by the current source review.",
    });
  }
  expect(await priceQuestion()).toBeUndefined();
  const history = await db()
    .select()
    .from(schema.portalResponses)
    .where(
      and(
        eq(schema.portalResponses.dealId, dealId),
        eq(schema.portalResponses.taskKey, beforeRace.key),
      ),
    );
  expect(history.filter((response) => response.kind === "answer").length).toBeGreaterThanOrEqual(3);
});
