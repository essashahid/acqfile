import { randomUUID } from "node:crypto";
import { env, failureInjectionFromEnv } from "@/lib/env";
import { durable } from "./durable";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { hashObject, sha256 } from "@/lib/hash";
import { getStorage } from "@/lib/storage";
import { assertMutation } from "@/lib/access";
import type { SessionContext } from "@/lib/workspace";
import { type StepContext } from "@/lib/pipeline/steps-runner";
import { requireDeal } from "./service";
import { arrivalFiles, sniff } from "./zip";
import { piiKey, scrubPayload } from "./identifiers";
import { parseArrival } from "./parse";
export const DEAL_PIPELINE = "deal-intake-v1";
const mime = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  unsupported: "application/octet-stream",
};
export async function intake(
  context: SessionContext,
  dealId: string,
  uploads: { path: string; bytes: Buffer }[],
  opts: {
    injectFailure?: { step: string; attempts: number };
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  await assertMutation(context, "deal-intake", undefined, 10);
  await requireDeal(context, dealId);
  piiKey();
  const files = arrivalFiles(uploads);
  const db = getDb();
  const batch = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`);
    const [count] = await tx
      .select({ n: sql<number>`coalesce(max(number),0)+1` })
      .from(schema.dealBatches)
      .where(eq(schema.dealBatches.dealId, dealId));
    const [batch] = await tx
      .insert(schema.dealBatches)
      .values({ dealId, number: Number(count!.n), actorId: context.user.id })
      .returning();
    return batch!;
  });
  const [run] = await db
    .insert(schema.processingRuns)
    .values({
      workspaceId: context.workspace.workspaceId,
      runType: "ingest",
      pipelineVersion: DEAL_PIPELINE,
      provider: env().LLM_PROVIDER,
      modelConfigHash: hashObject({ pipeline: DEAL_PIPELINE }),
      initiatedBy: context.user.id,
      documentsTotal: files.length,
      configJson: { dealId, batchId: batch.id },
      status: "running",
      startedAt: new Date(),
    })
    .returning();
  const rows = [];
  try {
    for (const f of files) {
      const hash = sha256(f.bytes),
        kind = sniff(f.bytes);
      const storagePath = `${context.workspace.workspaceId}/deals/${dealId}/${hash}/source`;
      const [prior] = await db
        .select()
        .from(schema.documentVersions)
        .where(
          and(
            eq(schema.documentVersions.dealId, dealId),
            eq(schema.documentVersions.contentHash, hash),
          ),
        );
      const ctx: StepContext = {
        workspaceId: context.workspace.workspaceId,
        processingRunId: run!.id,
        documentVersionId: prior?.id ?? randomUUID(),
        provider: env().LLM_PROVIDER,
        pipelineVersion: DEAL_PIPELINE,
        unregistered: !prior,
        modelConfigHash: hashObject({ batch: batch.id, path: f.path }),
        injectFailure: opts.injectFailure ?? failureInjectionFromEnv(),
      };
      await durable(
        ctx,
        "upload",
        async () => {
          if (!prior) await getStorage().put(storagePath, f.bytes, mime[kind]);
          return { stored: true };
        },
        opts.sleep,
      );
      const result = await durable(
        ctx,
        "hash_dedupe",
        () =>
          db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dealId},0))`);
            const [registered] = await tx
              .select()
              .from(schema.intakeFiles)
              .where(
                and(
                  eq(schema.intakeFiles.batchId, batch.id),
                  eq(schema.intakeFiles.originalPath, scrubPayload(f.path)),
                ),
              );
            if (registered) return registered;
            const [existing] = await tx
              .select()
              .from(schema.documentVersions)
              .where(
                and(
                  eq(schema.documentVersions.dealId, dealId),
                  eq(schema.documentVersions.contentHash, hash),
                ),
              );
            let version = existing;
            if (!version) {
              const [doc] = await tx
                .insert(schema.documents)
                .values({
                  dealId,
                  workspaceId: context.workspace.workspaceId,
                  logicalKey: `${dealId}:${hash}`,
                  displayName: scrubPayload(f.path.split("/").at(-1)!),
                })
                .returning();
              [version] = await tx
                .insert(schema.documentVersions)
                .values({
                  id: ctx.documentVersionId,
                  documentId: doc!.id,
                  dealId,
                  workspaceId: context.workspace.workspaceId,
                  versionNumber: 1,
                  contentHash: hash,
                  storagePath,
                  mimeType: mime[kind],
                  byteSize: f.bytes.length,
                  sourceFilename: scrubPayload(f.path.split("/").at(-1)!),
                  uploadedBy: context.user.id,
                })
                .returning();
            }
            const [row] = await tx
              .insert(schema.intakeFiles)
              .values({
                batchId: batch.id,
                documentVersionId: version!.id,
                originalPath: scrubPayload(f.path),
                contentHash: hash,
                duplicate: !!existing,
                runId: run!.id,
              })
              .returning();
            await tx.insert(schema.events).values({
              dealId,
              actorId: context.user.id,
              action: existing ? "duplicate_detected" : "file_uploaded",
              entityType: "document_version",
              entityId: version!.id,
              maskedAfter: { batch: batch.number, hash, arrivalId: row!.id },
            });
            return row!;
          }),
        opts.sleep,
      );
      await db
        .update(schema.runSteps)
        .set({ documentVersionId: result.documentVersionId })
        .where(
          and(
            eq(schema.runSteps.processingRunId, run!.id),
            sql`${schema.runSteps.idempotencyKey} like ${`${ctx.workspaceId}:${ctx.documentVersionId}:%`}`,
            sql`${schema.runSteps.documentVersionId} is null`,
          ),
        );
      if (!result.duplicate)
        await parseVersion(context, dealId, result.documentVersionId, run!.id, opts);
      rows.push(result);
    }
  } catch {
    await db
      .update(schema.processingRuns)
      .set({
        status: "failed",
        errorMessage: "Intake interrupted. Retry with the same source files.",
      })
      .where(eq(schema.processingRuns.id, run!.id));
    throw Error("Intake interrupted. Retry with the same source files.");
  }
  await db
    .update(schema.processingRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      documentsCompleted: rows.filter((r) => !r.duplicate).length,
    })
    .where(eq(schema.processingRuns.id, run!.id));
  return { batch, runId: run!.id, rows };
}
export async function parseVersion(
  context: SessionContext,
  dealId: string,
  versionId: string,
  runId: string,
  opts: {
    injectFailure?: { step: string; attempts: number };
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  await requireDeal(context, dealId);
  const db = getDb();
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(eq(schema.documentVersions.id, versionId), eq(schema.documentVersions.dealId, dealId)),
    );
  if (!version) throw Error("Version not found");
  const ctx: StepContext = {
    workspaceId: context.workspace.workspaceId,
    documentVersionId: versionId,
    processingRunId: runId,
    modelConfigHash: hashObject({ pipeline: DEAL_PIPELINE }),
    provider: env().LLM_PROVIDER,
    pipelineVersion: DEAL_PIPELINE,
    injectFailure: opts.injectFailure ?? failureInjectionFromEnv(),
  };
  return durable(
    ctx,
    "parse",
    async () => {
      const result = await parseArrival(await getStorage().get(version.storagePath), piiKey());
      // Source blocks live in this step's durable output (A41: no field-value tables); only counts reach the version row.
      const cursor = result.blocks.reduce((n, b) => n + b.text.length, 0);
      await db.transaction(async (tx) => {
        await tx
          .update(schema.documentVersions)
          .set({
            parseStatus: result.status === "parsed" ? "parsed" : "failed",
            processingStatus: result.status === "parsed" ? "queued" : "completed_with_review",
            pageCount: result.pages,
            charCount: cursor,
          })
          .where(eq(schema.documentVersions.id, versionId));
        if (result.status === "unreadable")
          await tx
            .insert(schema.intakeReviews)
            .values({
              dealId,
              documentVersionId: versionId,
              type: "unreadable",
              priority: "high",
              reason: result.reason!,
            })
            .onConflictDoNothing();
      });
      return result;
    },
    opts.sleep,
  );
}
