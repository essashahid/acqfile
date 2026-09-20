import { and, eq, sql, asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { hashObject } from "@/lib/hash";
import { env, failureInjectionFromEnv } from "@/lib/env";
import { MAX_ATTEMPTS, RETRY_SCHEDULE_MS } from "@/lib/config";
import { getStorage } from "@/lib/storage";
import type { SessionContext } from "@/lib/workspace";
import { runStep, StepFailure, type StepContext } from "@/lib/pipeline/steps-runner";
import { DEAL_PIPELINE, parseVersion } from "./intake";
import { classifyFile } from "./classifier";
import { deterministicSegments, assignParty, type Classified } from "./classification";
import { finalizeSegments, type FilingRecord } from "./filing";
import { requireDeal } from "./service";
import { requestEvaluation } from "@/lib/evaluation/run";
import type { DocumentType } from "@/lib/domain/registry";
import {
  extractSegment,
  extractionConfigHash,
  EXTRACTION_PIPELINE,
  type ExtractionSummary,
} from "@/lib/extract/run";
export async function processDealVersion(
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
  if (!version) throw Error("File not found");
  const parsed = await parseVersion(context, dealId, versionId, runId, opts);
  if (parsed.status === "unreadable")
    return { segments: [], deterministic: 0, classifier: 0, extraction: [] as ExtractionSummary[] };
  const ctx: StepContext = {
    workspaceId: context.workspace.workspaceId,
    documentVersionId: versionId,
    processingRunId: runId,
    modelConfigHash: hashObject({
      pipeline: DEAL_PIPELINE,
      provider: env().LLM_PROVIDER,
      model: env().OPENAI_EXTRACT_MODEL,
      prompt: "classifier-v1",
      signatures: "v1",
    }),
    provider: env().LLM_PROVIDER,
    pipelineVersion: DEAL_PIPELINE,
    injectFailure: opts.injectFailure ?? failureInjectionFromEnv(),
  };
  const retry = async <T>(name: string, body: () => Promise<T>) => {
    for (let i = 0; ; i++) {
      try {
        return (await runStep(ctx, name, body)).output;
      } catch (e) {
        if (!(e instanceof StepFailure) || !e.retryable || i >= MAX_ATTEMPTS - 1) throw e;
        await (opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(
          RETRY_SCHEDULE_MS[i] ?? 0,
        );
      }
    }
  };
  const classified = await retry("segment_classify", async () => {
    const deterministic = deterministicSegments(parsed);
    if (deterministic) return { segments: deterministic, method: "signature" as const };
    const call = await classifyFile(
      version.contentHash,
      parsed,
      await getStorage().get(version.storagePath),
    );
    await db.insert(schema.llmCalls).values({
      workspaceId: context.workspace.workspaceId,
      processingRunId: runId,
      documentVersionId: versionId,
      purpose: "classify",
      provider: ctx.provider,
      model: call.model,
      promptVersion: "classifier-v1",
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      latencyMs: call.latencyMs,
      costUsd: String(call.cost),
    });
    await db
      .update(schema.processingRuns)
      .set({
        inputTokens: sql`${schema.processingRuns.inputTokens}+${call.inputTokens}`,
        outputTokens: sql`${schema.processingRuns.outputTokens}+${call.outputTokens}`,
        estimatedCostUsd: sql`${schema.processingRuns.estimatedCostUsd}+${call.cost}`,
      })
      .where(eq(schema.processingRuns.id, runId));
    return { segments: call.segments, method: "llm" as const };
  });
  const assigned = await retry("assign_party_period", async () => {
    const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
    return classified.segments.map((s) => {
      const assigned = assignParty(s, parsed, parties);
      return {
        ...s,
        ...assigned,
        classification_method: classified.method,
        status:
          classified.segments.length > 1 || s.uncertain || assigned.assignment !== "matched"
            ? "proposed"
            : "confirmed",
      } as Classified;
    });
  });
  const result = await retry("finalize_segment", () =>
    finalizeSegments(context, dealId, versionId, assigned),
  );
  // Phase 4: read every confirmed segment through the six A39 steps.
  const extraction = await extractConfirmed(
    context,
    dealId,
    version,
    parsed,
    result.segments,
    runId,
    opts,
  );
  return {
    ...result,
    extraction,
    deterministic: classified.method === "signature" ? result.segments.length : 0,
    classifier: classified.method === "llm" ? result.segments.length : 0,
  };
}
export async function processDealRun(
  context: SessionContext,
  dealId: string,
  runId: string,
  opts: Parameters<typeof processDealVersion>[4] = {},
) {
  await requireDeal(context, dealId);
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.processingRuns)
    .where(
      and(
        eq(schema.processingRuns.id, runId),
        eq(schema.processingRuns.workspaceId, context.workspace.workspaceId),
      ),
    );
  if (!run || run.configJson.dealId !== dealId) throw Error("Run not found");
  const files = await db
    .select()
    .from(schema.intakeFiles)
    .where(eq(schema.intakeFiles.runId, runId))
    .orderBy(asc(schema.intakeFiles.createdAt), asc(schema.intakeFiles.id));
  await db
    .update(schema.processingRuns)
    .set({ status: "running", completedAt: null })
    .where(eq(schema.processingRuns.id, runId));
  let completed = 0,
    failed = 0;
  for (const f of files.filter((f) => !f.duplicate)) {
    try {
      await processDealVersion(context, dealId, f.documentVersionId, runId, opts);
      completed++;
    } catch {
      failed++;
    }
  }
  await db
    .update(schema.processingRuns)
    .set({
      status: failed ? "failed" : "completed",
      documentsCompleted: completed,
      documentsFailed: failed,
      completedAt: new Date(),
      errorMessage: failed ? "Some files need retry." : null,
    })
    .where(eq(schema.processingRuns.id, runId));
  await requestEvaluation(dealId);
  return { completed, failed };
}

/** Extract facts for the confirmed segments of a version. Called after filing and after an operator confirms segments. */
export async function extractConfirmed(
  context: SessionContext,
  dealId: string,
  version: { id: string; contentHash: string; storagePath: string },
  parsed: Awaited<ReturnType<typeof parseVersion>>,
  segments: {
    id: string;
    status: string;
    doc_type: string;
    page_start: number;
    page_end: number;
    party_id: string | null;
    period: string | null;
  }[],
  runId: string,
  opts: {
    injectFailure?: { step: string; attempts: number };
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  if (parsed.status !== "parsed") return [];
  const ctx: StepContext = {
    workspaceId: context.workspace.workspaceId,
    documentVersionId: version.id,
    processingRunId: runId,
    modelConfigHash: extractionConfigHash(),
    provider: env().LLM_PROVIDER,
    pipelineVersion: EXTRACTION_PIPELINE,
    injectFailure: opts.injectFailure ?? failureInjectionFromEnv(),
  };
  const out: ExtractionSummary[] = [];
  let bytes: Buffer | null = null;
  const load = async () => (bytes ??= await getStorage().get(version.storagePath));
  for (const s of segments.filter((s) => s.status === "confirmed"))
    out.push(
      await extractSegment(
        context,
        ctx,
        dealId,
        version.contentHash,
        parsed,
        load,
        {
          id: s.id,
          docType: s.doc_type as DocumentType,
          pageStart: s.page_start,
          pageEnd: s.page_end,
          partyId: s.party_id,
          period: s.period,
        },
        opts.sleep,
      ),
    );
  return out;
}

/** After an operator confirms or re-files segments, read the confirmed ones in a reprocess run. Parse is reused; completed steps are never repeated. */
export async function extractAfterReview(
  context: SessionContext,
  dealId: string,
  versionId: string,
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
  if (!version) throw Error("File not found");
  const [record] = await db
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, versionId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const segments = ((record?.payloadJson as FilingRecord | undefined)?.segments ?? []).filter(
    (s) => s.status === "confirmed",
  );
  if (!segments.length || version.parseStatus === "failed")
    return { runId: null, extraction: [] as ExtractionSummary[] };
  const [run] = await db
    .insert(schema.processingRuns)
    .values({
      workspaceId: context.workspace.workspaceId,
      runType: "reprocess",
      pipelineVersion: EXTRACTION_PIPELINE,
      provider: env().LLM_PROVIDER,
      modelConfigHash: extractionConfigHash(),
      initiatedBy: context.user.id,
      documentsTotal: 1,
      configJson: { dealId, documentVersionIds: [versionId] },
      status: "running",
      startedAt: new Date(),
    })
    .returning();
  try {
    const parsed = await parseVersion(context, dealId, versionId, run!.id, opts);
    const extraction = await extractConfirmed(
      context,
      dealId,
      version,
      parsed,
      segments,
      run!.id,
      opts,
    );
    await db
      .update(schema.processingRuns)
      .set({ status: "completed", documentsCompleted: 1, completedAt: new Date() })
      .where(eq(schema.processingRuns.id, run!.id));
    await requestEvaluation(dealId);
    return { runId: run!.id, extraction };
  } catch (e) {
    await db
      .update(schema.processingRuns)
      .set({
        status: "failed",
        documentsFailed: 1,
        completedAt: new Date(),
        errorMessage: "Extraction needs retry.",
      })
      .where(eq(schema.processingRuns.id, run!.id));
    throw e;
  }
}
