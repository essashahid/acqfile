import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import { reviewFact } from "@/lib/extract/review";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { answerQuestion, portalData } from "@/lib/portal/service";
import { processDealRun } from "@/lib/deals/process";
import { assertSampleKey } from "@/lib/deals/identifiers";
import { assertDemo } from "@/lib/demo/access";
import { demoCase, demoCode, type DemoCaseId } from "@/lib/demo/registry";
import { markedCase, DEMO_MARKER } from "@/lib/demo/service";
import type { SessionContext } from "@/lib/workspace";
export type DemoManifest = {
  id: DemoCaseId;
  draft: unknown;
  files: { path: string; stored: string; sha256: string; batch: number; document: string }[];
};
export function demoManifest(id: DemoCaseId): DemoManifest {
  return JSON.parse(fs.readFileSync(`fixtures/demo/generated/${id}/manifest.json`, "utf8"));
}
/** Existing authenticated staff membership; this command never provisions credentials. */
export async function demoOperator(): Promise<SessionContext> {
  const workspaceId = process.env.DEMO_CASE_WORKSPACE_ID;
  const userId = process.env.DEMO_CASE_ACTOR_ID;
  if (!workspaceId || !userId)
    throw Error(
      "Set DEMO_CASE_WORKSPACE_ID and DEMO_CASE_ACTOR_ID to an existing sample staff membership.",
    );
  const [row] = await getDb()
    .select()
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .innerJoin(schema.appUsers, eq(schema.appUsers.id, schema.workspaceMembers.userId))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    );
  if (!row) throw Error("Sample staff membership not found.");
  const ctx: SessionContext = {
    user: { id: userId, email: row.app_users.email, displayName: row.app_users.displayName },
    workspace: {
      workspaceId,
      slug: row.workspaces.slug,
      name: row.workspaces.name,
      role: row.workspace_members.role,
    },
  };
  assertDemo(ctx);
  return ctx;
}
export async function seedDemoCase(ctx: SessionContext, caseId: string, reset = false) {
  assertDemo(ctx);
  assertSampleKey();
  if (env().LLM_PROVIDER !== "mock")
    throw Error("Seed requires LLM_PROVIDER=mock; live holdout is a separate supervised workflow.");
  const c = demoCase(caseId);
  const manifest = demoManifest(c.id);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(`fixtures/demo/generated/${file.stored}`);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw Error(
        `Synthetic file hash mismatch: ${file.path}. Regenerate and inspect the case before seeding.`,
      );
  }
  // Serialize seed/reset for one workspace and case, including concurrent CLI invocations.
  const connection = await getSql().reserve();
  const lock = `${ctx.workspace.workspaceId}:demo:${c.id}`;
  try {
    await connection`select pg_advisory_lock(hashtextextended(${lock},0))`;
    const existing = await markedCase(ctx, c.id);
    if (existing && !reset) {
      const [finished] = await getDb()
        .select()
        .from(schema.events)
        .where(
          and(
            eq(schema.events.dealId, existing.seededDealId),
            eq(schema.events.action, "demo_seed_finished"),
          ),
        );
      if (!finished)
        throw Error(
          `Previous ${c.id} seed was interrupted. Inspect it and use the single-case reset command.`,
        );
      return existing.seededDealId;
    }
    if (reset && !existing) throw Error("Reset requires an existing marked synthetic case.");
    if (existing) {
      // Preserve append-only evidence and snapshots in an explicitly archived generation.
      // Links are revoked atomically before the fresh generation becomes selectable.
      await getDb().transaction(async (tx) => {
        await tx
          .update(schema.portalLinks)
          .set({ revoked: sql`current_date` })
          .where(eq(schema.portalLinks.dealId, existing.seededDealId));
        await tx
          .update(schema.deals)
          .set({ code: `Archived-${c.id}-${randomUUID()}`, status: "archived" })
          .where(
            and(
              eq(schema.deals.id, existing.seededDealId),
              eq(schema.deals.workspaceId, ctx.workspace.workspaceId),
            ),
          );
        await tx.insert(schema.events).values({
          dealId: existing.seededDealId,
          actorId: ctx.user.id,
          action: "demo_case_archived",
          entityType: "deal",
          entityId: existing.seededDealId,
          maskedAfter: {
            caseId: c.id,
            reason: "Explicit single-case reset; prior evidence preserved; links revoked",
          },
        });
      });
    }
    const id = await saveDeal(ctx, {
      ...(manifest.draft as object),
      code: demoCode(c.id),
      name: "Varnholt Climate Services LLC",
    });
    await getDb()
      .insert(schema.events)
      .values({
        dealId: id,
        actorId: ctx.user.id,
        action: DEMO_MARKER,
        entityType: "deal",
        entityId: id,
        maskedAfter: {
          caseId: c.id,
          workspaceId: ctx.workspace.workspaceId,
          readingMode: "Prepared sample extraction",
        },
      });
    const files = manifest.files.filter(
      (f) => f.batch === 1 && !(c.id === "D07" && f.document === "plan"),
    );
    const upload = await intake(
      ctx,
      id,
      files.map((f) => ({
        path: f.path,
        bytes: fs.readFileSync(`fixtures/demo/generated/${f.stored}`),
      })),
    );
    await processDealRun(ctx, id, upload.runId, { sleep: async () => {} });
    if (c.id === "D05") {
      const [duration] = await getDb()
        .select()
        .from(schema.facts)
        .where(
          and(
            eq(schema.facts.dealId, id),
            eq(schema.facts.attribute, "consulting.term_months"),
            eq(schema.facts.isCurrent, true),
          ),
        );
      if (!duration)
        throw Error("D05 needs the initial consulting reading before historical reopening.");
      await reviewFact(ctx, id, {
        fact_id: duration.id,
        expected_record_version: duration.recordVersion,
        action: "reopen",
        comment:
          "Synthetic initial staff review: two supplied transition drafts state 6 and 12 months; ask for clarification before relying on either.",
      });
    }
    if (c.id === "D06") {
      const question = (await portalData(id)).mapped.questions.find(
        (q) => q.title === "Which purchase price is right?",
      );
      if (!question) throw Error("Historical D06 price question did not appear; inspect the seed.");
      await answerQuestion(
        ctx,
        id,
        question.key,
        "900,000",
        "Synthetic historical answer: broker checked the initial agreement; later amendments have not arrived.",
        question.evidenceKey,
      );
    }
    if (c.id === "D07") {
      const transient = manifest.files.find((f) => f.document === "plan")!;
      const retry = await intake(ctx, id, [
        {
          path: transient.path,
          bytes: fs.readFileSync(`fixtures/demo/generated/${transient.stored}`),
        },
      ]);
      await processDealRun(ctx, id, retry.runId, {
        sleep: async () => {},
        injectFailure: { step: "segment_classify", attempts: 99 },
      });
    }
    await getDb()
      .insert(schema.events)
      .values({
        dealId: id,
        actorId: ctx.user.id,
        action: "demo_seed_finished",
        entityType: "deal",
        entityId: id,
        maskedAfter: { caseId: c.id },
      });
    return id;
  } finally {
    await connection`select pg_advisory_unlock(hashtextextended(${lock},0))`;
    connection.release();
  }
}
