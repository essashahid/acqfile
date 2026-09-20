import fs from "node:fs";
import { beforeAll, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, getSql } from "@/lib/db/client";
import { saveDeal, readDeal, dealDraft } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { seeded } from "./helpers";
import type { SessionContext } from "@/lib/workspace";
let ctx: SessionContext, id: string;
const draft = JSON.parse(
  fs.readFileSync("fixtures/deals/deal-a/truth/deal.json", "utf8"),
);
beforeAll(async () => {
  process.env.PII_HMAC_KEY = "SYNTHETIC-INTAKE-TEST-HMAC-KEY-ONLY-2026";
  const seed = await seeded();
  ctx = {
    user: {
      id: seed.adminId,
      email: "admin@example.com",
      displayName: "Synthetic administrator",
    },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  id = await saveDeal(ctx, {
    ...draft,
    code: "INTAKE-A",
    name: "Varnholt Climate Services",
  });
});
it("creates all profile fields, resolves pack, audits changes and rejects stale edits", async () => {
  const first = await readDeal(ctx, id);
  expect(first.deal.rulePackVersion).toBe("sop-50-10-8");
  expect(first.parties).toHaveLength(draft.parties.length);
  const edit = await dealDraft(ctx, id);
  await saveDeal(
    ctx,
    { ...edit, name: "Varnholt Climate Services - intake" },
    id,
    1,
  );
  await expect(saveDeal(ctx, edit, id, 1)).rejects.toThrow("Stale edit");
  expect(
    await getDb()
      .select()
      .from(schema.events)
      .where(eq(schema.events.dealId, id)),
  ).toHaveLength(2);
});
it("imports a ZIP batch, parses once, flags unreadable and links exact duplicates", async () => {
  const result = await intake(ctx, id, [
    {
      path: "batch-1.zip",
      bytes: fs.readFileSync("fixtures/deals/deal-a/batch-1.zip"),
    },
  ]);
  expect(result.batch.number).toBe(1);
  expect(result.rows).toHaveLength(37);
  expect(result.rows.filter((r) => r.duplicate)).toHaveLength(2);
  const reviews = await getDb()
    .select()
    .from(schema.intakeReviews)
    .where(eq(schema.intakeReviews.dealId, id));
  expect(
    reviews.some((r) => r.type === "unreadable" && r.priority === "high"),
  ).toBe(true);
  const steps = await getDb()
    .select()
    .from(schema.runSteps)
    .where(eq(schema.runSteps.processingRunId, result.runId));
  expect(steps.filter((s) => s.stepName === "parse")).toHaveLength(35);
  expect(
    await getDb()
      .select()
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.processingRunId, result.runId)),
  ).toHaveLength(0);
  const dup = await intake(ctx, id, [
    {
      path: "again/lease.PDF",
      bytes: fs.readFileSync(
        "fixtures/deals/deal-a/incoming/batch-1/Phone/scan0007.pdf",
      ),
    },
  ]);
  expect(dup.batch.number).toBe(2);
  expect(dup.rows[0]!.duplicate).toBe(true);
  expect(
    (
      await getDb()
        .select()
        .from(schema.runSteps)
        .where(eq(schema.runSteps.processingRunId, dup.runId))
    )
      .map((s) => s.stepName)
      .sort(),
  ).toEqual(["hash_dedupe", "upload"]);
  const rows =
    await getSql()`select row_to_json(t)::text as payload from source_blocks t union all select row_to_json(t)::text from run_steps t union all select row_to_json(t)::text from run_events t`;
  expect(
    rows.some((r) => /\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b/.test(r.payload)),
  ).toBe(false);
});
it("limits duplicate identity to the deal, and denies viewers and other workspaces", async () => {
  const second = await saveDeal(ctx, {
    ...draft,
    code: "INTAKE-B",
    name: "Varnholt Climate Services",
  });
  const up = await intake(ctx, second, [
    {
      path: "same.pdf",
      bytes: fs.readFileSync(
        "fixtures/deals/deal-a/incoming/batch-1/Phone/scan0007.pdf",
      ),
    },
  ]);
  expect(up.rows[0]!.duplicate).toBe(false);
  await expect(
    intake({ ...ctx, workspace: { ...ctx.workspace, role: "viewer" } }, id, []),
  ).rejects.toThrow("read-only");
  await expect(
    readDeal(
      {
        ...ctx,
        workspace: {
          ...ctx.workspace,
          workspaceId: "00000000-0000-0000-0000-000000000001",
        },
      },
      id,
    ),
  ).rejects.toThrow("not found");
});
it("upload, dedupe and parse execute inside retriable steps, with identifier-safe payloads", async () => {
  const { makePdf } = await import("./helpers");
  for (const step of ["upload", "hash_dedupe", "parse"]) {
    const bytes = await makePdf([
      "SYNTHETIC",
      `Arrival stage ${step}`,
      "SSN 900-12-3456 EIN 00-1234567 account: 987654321012",
      "Passport number AB1234567",
    ]);
    const up = await intake(ctx, id, [{ path: `private-${step}.pdf`, bytes }], {
      injectFailure: { step, attempts: 1 },
      sleep: async () => {},
    });
    const steps = await getDb()
      .select()
      .from(schema.runSteps)
      .where(eq(schema.runSteps.processingRunId, up.runId));
    expect(steps.find((s) => s.stepName === step)?.attemptCount).toBe(2);
    expect(JSON.stringify(steps)).not.toMatch(
      /900-12-3456|00-1234567|987654321012|AB1234567/,
    );
  }
});
