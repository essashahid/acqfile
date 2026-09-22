import fs from "node:fs";
import { beforeAll, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { getDb, schema } from "@/lib/db/client";
import { buildIndex } from "@/lib/deliverables/index-build";
import { createSnapshot, type SnapshotContent } from "@/lib/deliverables/snapshot";
import { packageZip } from "@/lib/deliverables/package";
import { portalData } from "@/lib/portal/service";
import { sourceUrl } from "@/lib/deals/source-url";
import { GET } from "@/app/(app)/deals/[dealId]/download/route";
import { requireWorkspace, type SessionContext } from "@/lib/workspace";
import { reviewFact, resolveGap } from "@/lib/extract/review";
import * as evaluation from "@/lib/evaluation/run";
import { recordAttestation } from "@/lib/evaluation/attestations";
import { intake } from "@/lib/deals/intake";
import { processDealRun, extractAfterReview } from "@/lib/deals/process";
import { reviewFile, type FilingRecord } from "@/lib/deals/filing";
import {
  fixtureDeal,
  uploadFixture,
  attestTruth,
  confirmBoundaries,
  reviewTruth,
  unlimited,
  type FixtureDeal,
} from "../helpers/deal-proof";
import { seeded, makePdf } from "./helpers";

vi.mock("@/lib/workspace", async (original) => ({
  ...(await original<object>()),
  requireWorkspace: vi.fn(),
}));
let ctx: SessionContext;
let deal: FixtureDeal;
let first: Awaited<ReturnType<typeof createSnapshot>>;
let oldBytes: Buffer;
const db = () => getDb();
const rows = (book: XLSX.WorkBook, sheet: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheet]!);
function download(version?: number) {
  const query = sourceUrl(deal.id, deal.id).split("?")[1];
  return GET(
    new Request(
      `http://localhost/deals/${deal.id}/download?${query}${version ? `&version=${version}` : ""}`,
    ),
    { params: Promise.resolve({ dealId: deal.id }) },
  );
}
beforeAll(async () => {
  const seed = await seeded();
  ctx = {
    user: { id: seed.adminId, email: "admin@example.com", displayName: "Synthetic operator" },
    workspace: { workspaceId: seed.workspaceId, slug: "default", name: "Sample", role: "admin" },
  };
  vi.mocked(requireWorkspace).mockResolvedValue({
    ...ctx,
    workspace: { ...ctx.workspace, role: "adviser" },
  });
  deal = await fixtureDeal(ctx, "deal-b", "ReadinessPassThree");
  await attestTruth(ctx, deal, 1);
  await uploadFixture(ctx, deal, 1);
  await confirmBoundaries(ctx, deal);
  await reviewTruth(ctx, deal);
  await uploadFixture(ctx, deal, 2);
  await confirmBoundaries(ctx, deal);
  await reviewTruth(ctx, deal);
  await unlimited();
  await recordAttestation(ctx, deal.id, {
    kind: "tracking",
    rule_id: "LND-01",
    scope_key: "deal",
    state: "ordered",
    note: "Synthetic later lender work remains outstanding.",
  });
}, 180000);

it("permits the authorized adviser to download preparation while later lender work remains listed, without a waiver", async () => {
  const built = await buildIndex(deal.id);
  expect(built.preparation.unresolved).toEqual([]);
  expect(built.preparation.ready).toBe(true);
  expect((await portalData(deal.id)).mapped.ready).toBe(true);
  expect(built.preparation.later).toContainEqual(
    expect.objectContaining({ item: "LND-01", status: "tracking" }),
  );
  expect(built.index.find((r) => r.item_id === "LND-01")?.decision_reason).toBe("");
  first = await createSnapshot(ctx, deal.id, { requirePrepared: true });
  oldBytes = (await packageZip(deal.id, first.id)).bytes;
  fs.writeFileSync("/tmp/acqfile-pass3-prepared.zip", oldBytes);
  const response = await download();
  expect(response.status).toBe(200);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const book = XLSX.read(await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer"));
  expect(rows(book, "Status summary")).toContainEqual(
    expect.objectContaining({
      Section: "Later lender work",
      Item: "Credit reports",
      Responsible: "lender",
      "Status / detail": "tracking",
    }),
  );
  expect(await zip.file("00_Package_Report.html")!.async("string")).toContain(
    "Prepared for lender review",
  );
  vi.mocked(requireWorkspace).mockResolvedValue({
    ...ctx,
    workspace: { ...ctx.workspace, role: "viewer" },
  });
  await expect(download()).rejects.toThrow("NEXT_REDIRECT");
  vi.mocked(requireWorkspace).mockResolvedValue({
    ...ctx,
    workspace: { ...ctx.workspace, workspaceId: crypto.randomUUID(), role: "adviser" },
  });
  await expect(download()).rejects.toThrow();
  vi.mocked(requireWorkspace).mockResolvedValue({
    ...ctx,
    workspace: { ...ctx.workspace, role: "adviser" },
  });
});

it("requires a new evaluation after a supported correction and preserves earlier bytes and source history", async () => {
  const current = await buildIndex(deal.id);
  const fact = current.facts.find(
    (f) =>
      f.attribute === "deal.purchase_price" && current.segments.some((s) => s.id === f.segmentId),
  );
  expect(fact).toBeDefined();
  const delay = vi.spyOn(evaluation, "requestEvaluation").mockResolvedValue();
  let corrected: Awaited<ReturnType<typeof reviewFact>>;
  try {
    await unlimited();
    corrected = await reviewFact(ctx, deal.id, {
      fact_id: fact!.id,
      expected_record_version: fact!.recordVersion,
      action: "edit_accept",
      value: fact!.valueJson,
      source: { ...(fact!.locatorJson as object), kind: "quote" },
      comment: "Confirmed the current price against the supplied page.",
    });
  } finally {
    delay.mockRestore();
  }
  expect((await buildIndex(deal.id)).preparation).toMatchObject({ ready: false, current: false });
  expect((await download()).status).toBe(409);
  expect((await download(first.number)).status).toBe(200);
  expect((await packageZip(deal.id, first.id)).bytes.equals(oldBytes)).toBe(true);
  await evaluation.requestEvaluation(deal.id);
  const built = await buildIndex(deal.id);
  expect(built.preparation.unresolved).toEqual([]);
  expect(built.sourceRecord.find((f) => f.fact_id === corrected!.factId)).toMatchObject({
    record_version: corrected!.recordVersion,
    page: (fact!.locatorJson as { page: number }).page,
    quote: (fact!.locatorJson as { quote: string }).quote,
  });
  expect(
    (first.contentJson as SnapshotContent).source_record.some((f) => f.fact_id === fact!.id),
  ).toBe(true);
});

it("exports readable issues, actual providers and the three original bundle ranges; an upload invalidates current readiness", async () => {
  const bytes = await makePdf(["SYNTHETIC", "Resume", "Buyer supplied document bundle"], 6);
  await unlimited();
  const upload = await intake(ctx, deal.id, [{ path: "buyer-bundle.pdf", bytes }]);
  expect((await buildIndex(deal.id)).preparation.ready).toBe(false);
  expect((await download()).status).toBe(409);
  await processDealRun(ctx, deal.id, upload.runId, { sleep: async () => {} });
  const [version] = await db()
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.dealId, deal.id),
        eq(schema.documentVersions.sourceFilename, "buyer-bundle.pdf"),
      ),
    );
  const [record] = await db()
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, version!.id),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const candidate = (record!.payloadJson as FilingRecord).segments[0]!;
  const party = (await buildIndex(deal.id)).parties.find(
    (p) => p.roles.includes("buyer_owner") && p.kind === "individual",
  )!;
  await unlimited();
  await reviewFile(ctx, deal.id, version!.id, {
    record_id: record!.id,
    segments: (["GOV_ID", "RESUME", "CREDIT_AUTH"] as const).map((type, i) => ({
      ...candidate,
      doc_type: type,
      page_start: i * 2 + 1,
      page_end: i * 2 + 2,
      quote_page: i * 2 + 1,
      party_id: party.id,
      period: null,
      uncertain: false,
      signed: true,
      dated: true,
      signature_date: "2026-09-10",
      expected_page_count: 2,
    })),
    force_current: true,
    note: "Synthetic three-document bundle inspected by the operator.",
  });
  await evaluation.requestEvaluation(deal.id);
  // An independently arranged provider assignment differs from the subject.
  const [missing] = await db()
    .select()
    .from(schema.findings)
    .where(
      and(
        eq(schema.findings.dealId, deal.id),
        eq(schema.findings.ruleId, "GUA-04"),
        eq(schema.findings.scopeKey, party.id),
      ),
    );
  expect(missing).toBeDefined();
  await db()
    .update(schema.findings)
    .set({ responsibleRole: "broker" })
    .where(eq(schema.findings.id, missing!.id));
  // The different price is printed in an actual supplied replacement, not invented in an export.
  const priceFile = await makePdf([
    "SYNTHETIC",
    "Letter of Intent",
    "Purchase price: $3,700,000",
    "Expiration date: 2026-12-01",
  ]);
  await unlimited();
  const priceUpload = await intake(ctx, deal.id, [
    { path: "different-price-loi.pdf", bytes: priceFile },
  ]);
  await processDealRun(ctx, deal.id, priceUpload.runId, { sleep: async () => {} });
  const [priceVersion] = await db()
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.dealId, deal.id),
        eq(schema.documentVersions.sourceFilename, "different-price-loi.pdf"),
      ),
    );
  const [priceRecord] = await db()
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, priceVersion!.id),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const proposed = (priceRecord!.payloadJson as FilingRecord).segments[0]!;
  await unlimited();
  await reviewFile(ctx, deal.id, priceVersion!.id, {
    record_id: priceRecord!.id,
    segments: [
      {
        ...proposed,
        doc_type: "LOI",
        party_id: party.id,
        uncertain: false,
        document_date: "2026-09-11",
      },
    ],
    force_current: true,
    note: "Reviewed the supplied letter and its printed price.",
  });
  await extractAfterReview(ctx, deal.id, priceVersion!.id);
  const [price] = await db()
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.documentVersionId, priceVersion!.id),
        eq(schema.facts.attribute, "deal.purchase_price"),
        eq(schema.facts.isCurrent, true),
      ),
    );
  await unlimited();
  const support = {
    value: 3700000,
    source: { page: 1, quote: "Purchase price: $3,700,000", kind: "quote" },
    comment: "Confirmed the printed amount on the supplied letter.",
  };
  if (price)
    await reviewFact(ctx, deal.id, {
      ...support,
      fact_id: price.id,
      expected_record_version: price.recordVersion,
      action: "edit_accept",
    });
  else {
    // The mock corpus does not extract this newly authored PDF; arrange the operator's gap task.
    const [segment] = await db()
      .select()
      .from(schema.segments)
      .where(
        and(
          eq(schema.segments.documentVersionId, priceVersion!.id),
          eq(schema.segments.isCurrent, true),
        ),
      );
    const [gap] = await db()
      .insert(schema.intakeReviews)
      .values({
        dealId: deal.id,
        documentVersionId: priceVersion!.id,
        segmentId: segment!.id,
        attribute: "deal.purchase_price",
        type: "extraction_gap",
        reason: "Read the printed purchase price from this synthetic source.",
      })
      .returning();
    await resolveGap(ctx, deal.id, { ...support, review_id: gap!.id, action: "enter" });
  }
  const snapshot = await createSnapshot(ctx, deal.id);
  const content = snapshot.contentJson as SnapshotContent;
  expect(content.preparation?.ready).toBe(false);
  const exported = (await packageZip(deal.id, snapshot.id)).bytes;
  fs.writeFileSync("/tmp/acqfile-pass3-issues.zip", exported);
  const zip = await JSZip.loadAsync(exported);
  const book = XLSX.read(await zip.file("00_Package_Workbook.xlsx")!.async("nodebuffer"));
  const locations = rows(book, "Segment locations").filter(
    (r) => r["Original filename"] === "buyer-bundle.pdf",
  );
  expect(
    locations.map((r) => [
      r.Type,
      r["Original page start"],
      r["Original page end"],
      r["Output page start"],
      r["Output page end"],
    ]),
  ).toEqual([
    ["GOV_ID", 1, 2, 1, 2],
    ["RESUME", 3, 4, 3, 4],
    ["CREDIT_AUTH", 5, 6, 5, 6],
  ]);
  for (const location of locations)
    expect(await zip.file(String(location["Package path"]))!.async("nodebuffer")).toEqual(bytes);
  expect(rows(book, "Missing items")).toContainEqual(
    expect.objectContaining({
      Item: "GUA-04",
      "Applies to": party.legalName,
      Responsible: "broker",
    }),
  );
  const conflict = rows(book, "Conflicts").filter(
    (r) => r.Rule === "CON-03" && r.Status === "open",
  );
  expect(conflict.length).toBeGreaterThan(1);
  expect(conflict.map((r) => r.Value).join(" ")).toContain("3700000");
  expect(conflict.map((r) => r.Value).join(" ")).toContain("3600000");
  for (const side of conflict) {
    expect(side["Issue title"]).toMatch(/purchase price/i);
    expect(String(side["Description / question"]).length).toBeGreaterThan(10);
    if (side["Package path"]) {
      expect(zip.file(String(side["Package path"]))).not.toBeNull();
      expect(side.Page).toBeGreaterThan(0);
      expect(side.Quote).toBeTruthy();
    }
  }
  expect((await packageZip(deal.id, first.id)).bytes.equals(oldBytes)).toBe(true);
});
