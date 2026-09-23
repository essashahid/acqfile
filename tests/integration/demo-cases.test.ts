import { beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { DEMO_CASES } from "@/lib/demo/registry";
import fs from "node:fs";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun } from "@/lib/deals/process";
import { mayOpenOriginal, portalData } from "@/lib/portal/service";
import { demoManifest } from "../../scripts/demo-case-seed";
import { seedDemoCase } from "../../scripts/demo-case-seed";
import { markedCase } from "@/lib/demo/service";
import { createPortalLink, resolvePortal } from "@/lib/portal/service";
import { seeded } from "./helpers";
import { unlimited } from "../helpers/deal-proof";
import { buildIndex } from "@/lib/deliverables/index-build";
import type { SessionContext } from "@/lib/workspace";
let ctx: SessionContext;
const ids = new Map<string, string>();
beforeAll(async () => {
  const s = await seeded();
  process.env.ACQFILE_SAMPLE_MODE = "true";
  process.env.REAL_DATA_MODE = "false";
  process.env.DEMO_CASE_WORKSPACE_ID = s.workspaceId;
  ctx = {
    user: { id: s.adminId, email: "admin@example.com", displayName: "Sample staff" },
    workspace: { workspaceId: s.workspaceId, name: "Sample", slug: "default", role: "admin" },
  };
});
it("seeds all eight initial cases through intake, preserves pending review and does not seed corrections or exports", async () => {
  for (const c of DEMO_CASES) {
    await unlimited();
    const id = await seedDemoCase(ctx, c.id);
    ids.set(c.id, id);
    expect((await markedCase(ctx, c.id))?.seededDealId).toBe(id);
    const b = await buildIndex(id);
    expect(b.preparation.ready, c.id).toBe(false);
    expect(
      await getDb().select().from(schema.snapshots).where(eq(schema.snapshots.dealId, id)),
    ).toHaveLength(0);
    expect(
      b.versions.some((v) => v.sourceFilename.includes("round-2")),
      c.id,
    ).toBe(false);
  }
}, 240000);
it("reruns without changing progress, and resets only a marked case while revoking its old links", async () => {
  const id = ids.get("D01")!;
  const before = await getDb().select().from(schema.events).where(eq(schema.events.dealId, id));
  expect(await seedDemoCase(ctx, "D01")).toBe(id);
  expect(await getDb().select().from(schema.events).where(eq(schema.events.dealId, id))).toEqual(
    before,
  );
  const [p] = await getDb()
    .select()
    .from(schema.parties)
    .where(and(eq(schema.parties.dealId, id), eq(schema.parties.externalKey, "alex")));
  const token = await createPortalLink(ctx, id, p!.id);
  await unlimited();
  const fresh = await seedDemoCase(ctx, "D01", true);
  expect(fresh).not.toBe(id);
  expect(await resolvePortal(token)).toBeNull();
  for (const c of DEMO_CASES.slice(1))
    expect((await markedCase(ctx, c.id))?.seededDealId).toBe(ids.get(c.id));
  const [old] = await getDb().select().from(schema.deals).where(eq(schema.deals.id, id));
  expect(old!.status).toBe("archived");
  await expect(
    seedDemoCase(
      { ...ctx, workspace: { ...ctx.workspace, workspaceId: crypto.randomUUID() } },
      "D02",
      true,
    ),
  ).rejects.toThrow("configured sample workspace");
});

it("D06 starts with an evidence-keyed historical answer, and D02 recipient links cannot retrieve a mixed bundle or the other owner", async () => {
  const question = (await portalData(ids.get("D06")!)).mapped.questions.find(
    (q) => q.title === "Which purchase price is right?",
  )!;
  expect(question.answered).toBe(true);
  expect(question.answer?.payload.choice).toBe("900,000");
  const d = ids.get("D02")!;
  const [owner] = await getDb()
    .select()
    .from(schema.parties)
    .where(and(eq(schema.parties.dealId, d), eq(schema.parties.externalKey, "alex")));
  const token = await createPortalLink(ctx, d, owner!.id);
  const access = (await resolvePortal(token))!;
  const b = await buildIndex(d);
  const mixed = b.versions.find((v) => v.sourceFilename === "document.pdf")!;
  expect(await mayOpenOriginal(access, mixed.id)).toBe(false);
  const other = b.segments.find((s) => s.partyId !== owner!.id && s.docType === "SBA_413")!;
  expect(await mayOpenOriginal(access, other.documentVersionId)).toBe(false);
  expect(await mayOpenOriginal(access, (await buildIndex(ids.get("D03")!)).versions[0]!.id)).toBe(
    false,
  );
});
it("D07 retries the injected local failure and duplicate upload without losing evidence", async () => {
  const d = ids.get("D07")!;
  const runs = await getDb()
    .select()
    .from(schema.processingRuns)
    .where(eq(schema.processingRuns.workspaceId, ctx.workspace.workspaceId));
  const failed = runs.find((r) => r.configJson.dealId === d && r.status === "failed")!;
  expect(failed).toBeDefined();
  expect((await processDealRun(ctx, d, failed.id, { sleep: async () => {} })).failed).toBe(0);
  const source = demoManifest("D07").files.find((f) => f.document === "plan")!;
  const before = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, d));
  await unlimited();
  await intake(ctx, d, [
    {
      path: "retry-again.docx",
      bytes: fs.readFileSync(`fixtures/demo/generated/${source.stored}`),
    },
  ]);
  const after = await getDb()
    .select()
    .from(schema.documentVersions)
    .where(eq(schema.documentVersions.dealId, d));
  expect(after.map((v) => v.id).sort()).toEqual(before.map((v) => v.id).sort());
  expect((await buildIndex(d)).preparation.ready).toBe(false);
});

it("refuses a target with a missing marker and preserves its evidence", async () => {
  const marked = ids.get("D02")!;
  await getDb()
    .update(schema.deals)
    .set({ code: "Saved-marked-D02" })
    .where(eq(schema.deals.id, marked));
  // A normal, unmarked deal happens to use the reserved name. Do not bypass immutable audit history.
  const dealId = await saveDeal(ctx, {
    ...(demoManifest("D02").draft as object),
    code: "Synthetic-D02",
    name: "Unmarked collision",
  });
  await expect(seedDemoCase(ctx, "D02", true)).rejects.toThrow("unmarked demo target");
  const [retained] = await getDb().select().from(schema.deals).where(eq(schema.deals.id, dealId));
  expect(retained!.code).toBe("Synthetic-D02");
  expect((await buildIndex(marked)).versions.length).toBeGreaterThan(0);
  const questions = (await portalData(ids.get("D05")!)).mapped.questions;
  expect(questions.map((q) => q.title)).toContain("What is the consulting period?");
});
