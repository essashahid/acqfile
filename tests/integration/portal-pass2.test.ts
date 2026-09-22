import { beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { reviewFile, type FilingRecord } from "@/lib/deals/filing";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import { extractAfterReview } from "@/lib/deals/process";
import { requestEvaluation } from "@/lib/evaluation/run";
import { createPortalLink, portalData, resolvePortal } from "@/lib/portal/service";
import { personHome } from "@/lib/portal/map";
import { startUpload } from "@/lib/portal/upload";
import { fixtureDeal, unlimited } from "../helpers/deal-proof";
import { makePdf, seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";

let ctx: SessionContext;
let dealId: string;
let buyerId: string;
let token: string;
const db = () => getDb();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  const seed = await seeded();
  ctx = {
    user: { id: seed.reviewerId, email: "reviewer@example.com", displayName: "Operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "reviewer" },
  };
  const deal = await fixtureDeal(ctx, "deal-a", "PortalPassTwo");
  dealId = deal.id;
  buyerId = deal.internal("alex");
  token = await createPortalLink(ctx, dealId, buyerId);
});

it("moves a phone image from staff review to a signature task, then a current replacement to done", async () => {
  const access = (await resolvePortal(token))!;
  const initial = await portalData(dealId);
  const task = initial.mapped.tasks.find(
    (item) => item.partyId === buyerId && item.type === "SBA_413",
  )!;
  expect(task.state).toBe("To do");
  await unlimited();
  const phone = await startUpload(access, task.key, [{ name: "phone.png", bytes: png }]);
  const phoneId = (phone.response.payload.versions as string[])[0]!;
  expect((await portalData(dealId)).mapped.tasks.find((item) => item.key === task.key)!.state).toBe(
    "With us for review",
  );
  await phone.work();
  expect((await portalData(dealId)).mapped.tasks.find((item) => item.key === task.key)!.state).toBe(
    "With us for review",
  );
  const [record] = await db()
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, phoneId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const candidate = (record!.payloadJson as FilingRecord).segments[0]!;
  await unlimited();
  await reviewFile(ctx, dealId, phoneId, {
    record_id: record!.id,
    segments: [
      {
        ...candidate,
        doc_type: "SBA_413",
        party_id: buyerId,
        signed: false,
        dated: false,
        signature_date: null,
        document_date: null,
        uncertain: false,
      },
    ],
    note: "The submitted image needs a signature and date.",
    force_current: true,
  });
  await extractAfterReview(ctx, dealId, phoneId);
  await requestEvaluation(dealId);
  const decided = await portalData(dealId);
  expect(
    decided.data.index.find((item) => item.item_id === "GUA-01" && item.scope_key === buyerId)
      ?.status,
  ).toBe("received_with_issues");
  expect(decided.mapped.tasks.find((item) => item.key === task.key)).toMatchObject({
    state: "To do",
    sentence: expect.stringContaining("sign and date"),
  });
  expect(
    personHome(decided.mapped, buyerId, access.party.legalName).todo.some(
      (item) => item.key === task.key,
    ),
  ).toBe(true);
  const replacementBytes = await makePdf([
    "SBA Form 413 Personal Financial Statement",
    "Name: Kiel McDermott",
    "As of date: 2026-09-10",
    "Cash: $10,000",
    "Total assets: $100,000",
    "Total liabilities: $30,000",
    "Net worth: $70,000",
    "Signature: e-signed; Date: 2026-09-10",
  ]);
  await unlimited();
  const replacement = await startUpload(
    access,
    task.key,
    [{ name: "signed-statement.pdf", bytes: replacementBytes }],
    phoneId,
  );
  expect((await portalData(dealId)).mapped.tasks.find((item) => item.key === task.key)!.state).toBe(
    "With us for review",
  );
  await replacement.work();
  const replacementId = (replacement.response.payload.versions as string[])[0]!;
  const [replacementRecord] = await db()
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, replacementId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const replacementCandidate = (replacementRecord!.payloadJson as FilingRecord).segments[0]!;
  await unlimited();
  await reviewFile(ctx, dealId, replacementId, {
    record_id: replacementRecord!.id,
    segments: [
      {
        ...replacementCandidate,
        doc_type: "SBA_413",
        party_id: buyerId,
        signed: true,
        dated: true,
        signature_date: "2026-09-10",
        document_date: "2026-09-10",
        uncertain: false,
      },
    ],
    note: "The signed replacement is complete and belongs to the buyer.",
    force_current: true,
  });
  await extractAfterReview(ctx, dealId, replacementId);
  await requestEvaluation(dealId);
  const [currentSegment] = await db()
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.documentVersionId, replacementId),
        eq(schema.segments.isCurrent, true),
      ),
    );
  for (const [attribute, value, quote] of [
    ["pfs.as_of_date", "2026-09-10", "As of date: 2026-09-10"],
    ["pfs.total_assets", 100000, "Total assets: $100,000"],
    ["pfs.total_liabilities", 30000, "Total liabilities: $30,000"],
    ["pfs.net_worth", 70000, "Net worth: $70,000"],
  ] as const) {
    const source = { page: 1, quote, kind: "quote" as const };
    const [fact] = await db()
      .select()
      .from(schema.facts)
      .where(
        and(
          eq(schema.facts.segmentId, currentSegment!.id),
          eq(schema.facts.attribute, attribute),
          eq(schema.facts.isCurrent, true),
        ),
      );
    await unlimited();
    if (fact)
      await reviewFact(ctx, dealId, {
        fact_id: fact.id,
        expected_record_version: fact.recordVersion,
        action: "edit_accept",
        value,
        source,
        comment: "Confirmed on the signed replacement.",
      });
    else {
      const [gap] = await db()
        .select()
        .from(schema.intakeReviews)
        .where(
          and(
            eq(schema.intakeReviews.segmentId, currentSegment!.id),
            eq(schema.intakeReviews.attribute, attribute),
            eq(schema.intakeReviews.status, "open"),
          ),
        );
      expect(gap).toBeDefined();
      await resolveGap(ctx, dealId, {
        review_id: gap!.id,
        action: "enter",
        value,
        source,
        comment: "Confirmed on the signed replacement.",
      });
    }
  }
  const after = await portalData(dealId);
  expect(
    after.data.versions.find((version) => version.id === replacementId)?.processingStatus,
  ).toMatch(/completed/);
  expect(
    after.data.index.find((item) => item.item_id === "GUA-01" && item.scope_key === buyerId)
      ?.status,
  ).toBe("satisfied");
  expect(after.mapped.tasks.find((item) => item.key === task.key)!.state).toBe("Done");
  expect(
    personHome((await portalData(dealId)).mapped, buyerId, access.party.legalName).done.some(
      (item) => item.key === task.key,
    ),
  ).toBe(true);
});
