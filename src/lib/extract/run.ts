import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import { hashObject } from "@/lib/hash";
import { runStep, type StepContext } from "@/lib/pipeline/steps-runner";
import { RETRY_SCHEDULE_MS, VERIFIER_BATCH_SIZE } from "@/lib/config";
import { FACTS, type DocumentType } from "@/lib/domain/registry";
import type { Parsed } from "@/lib/deals/parse";
import { subPdf } from "@/lib/deals/classifier";
import { scrubPayload } from "@/lib/deals/identifiers";
import type { SessionContext } from "@/lib/workspace";
import type { Candidate, Scored, Validation, Verdict } from "./candidate";
import { readAcroform } from "./acroform";
import { extractionFields, expectedAttributes, schemaHash } from "./schema";
import { EXTRACT_PROMPT_VERSION, VERIFY_PROMPT_VERSION, type PromptBlock, type VerifyPromptItem } from "./prompts";
import { createMockExtractionProvider } from "./mock";
import { createOpenAiExtractionProvider } from "./openai";
import type { ExtractionProvider, Usage } from "./provider";
import { decodeModelValue, normalizeFact, valueText } from "./values";
import { validateCandidates } from "./validate";
import { score } from "./confidence";
import { resolveOwnership } from "./entities";
export const EXTRACTION_PIPELINE = "deal-extract-v1";
export const EXTRACTION_STEPS = ["extract", "deterministic_validate", "independent_verify", "calculate_confidence", "route_review", "finalize_segment"] as const;
let cachedProvider: ExtractionProvider | null = null;
export function extractionProvider(): ExtractionProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = env().LLM_PROVIDER === "mock" ? createMockExtractionProvider() : createOpenAiExtractionProvider();
  return cachedProvider;
}
export function resetExtractionProvider() {
  cachedProvider = null;
}
export function extractionConfigHash(provider = extractionProvider()) {
  return hashObject({ pipeline: EXTRACTION_PIPELINE, provider: provider.name, models: provider.models, prompts: [EXTRACT_PROMPT_VERSION, VERIFY_PROMPT_VERSION], schema: schemaHash() });
}
export type SegmentTarget = { id: string; docType: DocumentType; pageStart: number; pageEnd: number; partyId: string | null; period: string | null };
export type ExtractionSummary = { segmentId: string; facts: number; byMethod: Record<string, number>; routing: Record<string, number>; gaps: string[]; modelCalls: number };
async function recordCall(context: SessionContext, ctx: StepContext, purpose: "extract" | "verify", usage: Usage, promptVersion: string) {
  const db = getDb();
  await db.insert(schema.llmCalls).values({ workspaceId: context.workspace.workspaceId, processingRunId: ctx.processingRunId, documentVersionId: ctx.documentVersionId, purpose, provider: ctx.provider, model: usage.model, promptVersion, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs: usage.latencyMs, costUsd: String(usage.cost) });
  await db.update(schema.processingRuns).set({ inputTokens: sql`${schema.processingRuns.inputTokens}+${usage.inputTokens}`, outputTokens: sql`${schema.processingRuns.outputTokens}+${usage.outputTokens}`, estimatedCostUsd: sql`${schema.processingRuns.estimatedCostUsd}+${usage.cost}` }).where(eq(schema.processingRuns.id, ctx.processingRunId));
}
/** Run the six A39 steps for one confirmed segment. Steps are durable per segment; a completed step is never repeated or re-billed. */
export async function extractSegment(context: SessionContext, base: StepContext, dealId: string, hash: string, parsed: Parsed, bytes: () => Promise<Buffer>, segment: SegmentTarget, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<ExtractionSummary> {
  const provider = extractionProvider();
  const ctx: StepContext = { ...base, scope: segment.id };
  const retry = async <T>(name: string, body: () => Promise<T>) => {
    for (let i = 0; ; i++) {
      try {
        return (await runStep(ctx, name, body)).output;
      } catch (e) {
        const delay = RETRY_SCHEDULE_MS[i];
        if (!(e instanceof Error && "retryable" in e && (e as { retryable: boolean }).retryable) || delay === undefined) throw e;
        await sleep(delay);
      }
    }
  };
  const fields = extractionFields(segment.docType);
  const blocks = parsed.blocks.filter((b) => b.page >= segment.pageStart && b.page <= segment.pageEnd);
  const promptBlocks: PromptBlock[] = blocks.filter((b) => b.kind !== "field" || b.text).map((b) => ({ source_block_id: b.locator, page: b.page, text: b.text, ...(b.image_only ? { image_only: true } : {}) }));
  const imagePages = [...new Set(blocks.filter((b) => b.image_only).map((b) => b.page))];
  const pdf = async () => (imagePages.length ? subPdf(await bytes(), imagePages) : null);
  let modelCalls = 0;
  // 1. extract
  const candidates = await retry("extract", async (): Promise<Candidate[]> => {
    if (!fields.length) return [];
    const acro = readAcroform(parsed, segment.docType, segment.pageStart, segment.pageEnd, fields);
    if (acro) return acro;
    const vision = imagePages.length > 0;
    const request = { hash, docType: segment.docType, pageStart: segment.pageStart, pageEnd: segment.pageEnd, fields, blocks: promptBlocks, imagePages, pdf: await pdf(), pass: 1 as const };
    const first = await provider.extract(request);
    await recordCall(context, ctx, "extract", first.usage, EXTRACT_PROMPT_VERSION);
    modelCalls++;
    const second = vision ? await provider.extract({ ...request, pass: 2 }) : null;
    if (second) { await recordCall(context, ctx, "extract", second.usage, EXTRACT_PROMPT_VERSION); modelCalls++; }
    const out: Candidate[] = [];
    for (const def of fields) {
      const field = first.output.fields.find((f) => f.attribute === def.attribute);
      if (!field || field.value === null) continue;
      const decoded = decodeModelValue(def, field.value);
      const cited = field.source_block_ids.map((id) => blocks.find((b) => b.locator === id)).filter(Boolean);
      const isVision = cited.some((b) => b!.image_only) || (vision && !cited.length);
      let value = decoded.value;
      // A40: a text-layer identifier is code-read as HMAC plus last four; the model only ever supplies last four.
      if (def.value_type === "identifier" && value && typeof value === "object" && !("hmac" in value)) {
        const lastFour = (value as { last_four: string }).last_four;
        const read = parsed.identifiers.find((i) => i.page >= segment.pageStart && i.page <= segment.pageEnd && i.last_four === lastFour && (def.attribute === "bank.account" ? i.kind === "account" : i.kind !== "account"));
        if (read) value = { hmac: read.hmac, last_four: read.last_four };
      }
      const secondField = second?.output.fields.find((f) => f.attribute === def.attribute);
      out.push(scrubPayload({ attribute: def.attribute, method: isVision ? "vision" : "text", value, raw: field.value, source_block_ids: field.source_block_ids, quote: field.evidence_quote, region: field.region, ambiguity: field.ambiguity, page: cited[0]?.page ?? null, decode_error: decoded.error, ...(isVision ? { second_read: secondField && secondField.value !== null ? decodeModelValue(def, secondField.value).value : null } : {}) }));
    }
    return out;
  });
  // 2. deterministic_validate
  const validations = await retry("deterministic_validate", async (): Promise<Validation[]> => validateCandidates(candidates, parsed.blocks, segment.pageStart, segment.pageEnd));
  // 3. independent_verify (text and vision only; up to twelve fields of one segment per call)
  const verdicts = await retry("independent_verify", async (): Promise<Verdict[]> => {
    const items: VerifyPromptItem[] = candidates.filter((c) => c.method !== "acroform").map((c, index) => {
      const cited = c.source_block_ids.map((id) => blocks.find((b) => b.locator === id)).filter(Boolean).map((b) => ({ source_block_id: b!.locator, page: b!.page, text: b!.text, ...(b!.image_only ? { image_only: true } : {}) }));
      const pages = new Set(cited.map((b) => b.page));
      const context_ = promptBlocks.filter((b) => pages.has(b.page) && !cited.some((x) => x.source_block_id === b.source_block_id)).slice(0, 12);
      return { index, attribute: c.attribute, candidate: JSON.stringify(c.value), evidence_quote: c.quote, cited_blocks: cited, context: context_ };
    });
    const out: Verdict[] = [];
    for (let i = 0; i < items.length; i += VERIFIER_BATCH_SIZE) {
      const batch = items.slice(i, i + VERIFIER_BATCH_SIZE);
      const response = await provider.verify({ hash, pageStart: segment.pageStart, items: batch, pdf: batch.some((b) => b.cited_blocks.some((x) => x.image_only)) ? await pdf() : null });
      await recordCall(context, ctx, "verify", response.usage, VERIFY_PROMPT_VERSION);
      modelCalls++;
      for (const item of batch) {
        const r = response.output.items.find((x) => x.index === item.index);
        const def = FACTS[item.attribute]!;
        let corrected: unknown = null;
        if (r?.corrected_value !== null && r?.corrected_value !== undefined) corrected = decodeModelValue(def, r.corrected_value).value;
        out.push(scrubPayload({ attribute: item.attribute, status: (r?.status.toLowerCase() ?? "unsupported") as Verdict["status"], corrected_value: corrected, contradiction: r?.contradiction_detected ?? false, specificity: r?.evidence_specificity ?? 0, reason: r?.reason ?? "No verifier response." }));
      }
    }
    return out;
  });
  // 4. calculate_confidence
  const scores = await retry("calculate_confidence", async (): Promise<Scored[]> => candidates.map((c) => score(c, validations.find((v) => v.attribute === c.attribute)!, verdicts.find((v) => v.attribute === c.attribute) ?? null)));
  // 5. route_review: routing per candidate plus gaps for expected attributes the extractor left null
  const routed = await retry("route_review", async () => {
    const gaps = expectedAttributes(segment.docType).filter((a) => !candidates.some((c) => c.attribute === a));
    return { gaps, routing: Object.fromEntries(scores.map((s) => [s.attribute, s.routing])) };
  });
  // 6. finalize_segment: immutable fact rows, gap review items, audit event
  return retry("finalize_segment", async (): Promise<ExtractionSummary> => {
    const db = getDb();
    return db.transaction(async (tx) => {
      const previous = await tx.select().from(schema.facts).where(and(eq(schema.facts.segmentId, segment.id), eq(schema.facts.isCurrent, true)));
      const maxVersion = previous.reduce((n, f) => Math.max(n, f.recordVersion), 0);
      if (previous.length) await tx.update(schema.facts).set({ isCurrent: false }).where(and(eq(schema.facts.segmentId, segment.id), eq(schema.facts.isCurrent, true)));
      const byMethod: Record<string, number> = {}, routing: Record<string, number> = {};
      let facts = 0;
      for (const c of candidates) {
        const s = scores.find((x) => x.attribute === c.attribute)!, v = validations.find((x) => x.attribute === c.attribute)!, verdict = verdicts.find((x) => x.attribute === c.attribute) ?? null;
        const def = FACTS[c.attribute]!;
        if (def.value_type === "identifier" && !(c.value && typeof c.value === "object" && "hmac" in c.value)) {
          // A40: only the last four exist on an image; the operator enters the full identifier from the original and code stores it masked.
          await tx.insert(schema.intakeReviews).values({ dealId, documentVersionId: ctx.documentVersionId, segmentId: segment.id, attribute: c.attribute, type: "extraction_gap", reason: `Only the last four digits (${(c.value as { last_four?: string } | null)?.last_four ?? "unknown"}) were read from the image; enter the identifier from the original to store it masked.` }).onConflictDoNothing();
          continue;
        }
        if (!v.locators_ok && s.routing === "blocked" && (c.value === null || v.messages.some((m) => m.code === "type_invalid"))) continue;
        if (c.value === null || v.messages.some((m) => m.code === "type_invalid" || m.code === "date_invalid")) continue;
        const page = c.page ?? segment.pageStart;
        const locator = { file: ctx.documentVersionId, page, source_block: c.source_block_ids[0] ?? `page-${page}`, quote: c.quote && c.quote.length ? c.quote : valueText(c.value), ...(c.method === "vision" ? { region: c.region ?? c.attribute, verbatim: false } : {}) };
        await tx.insert(schema.facts).values({ dealId, segmentId: segment.id, subjectPartyId: def.subject_kind === "deal" ? null : segment.partyId, attribute: c.attribute, valueJson: c.value as object, normalizedValueJson: normalizeFact(c.attribute, c.value) as object, unit: def.unit, period: segment.period, method: c.method, locatorJson: locator, confidence: String(s.confidence), confidenceComponents: s.components, validatorsPassed: v.score > 0, routingStatus: s.routing, recordVersion: maxVersion + 1, isCurrent: true, documentVersionId: ctx.documentVersionId, verifierReason: verdict?.reason ?? null, validationJson: [...v.messages, ...s.reasons.filter((r) => !v.messages.some((m) => m.code === r)).map((code) => ({ code, level: "info" }))], correctedValueJson: verdict && verdict.corrected_value !== null && JSON.stringify(normalizeFact(c.attribute, verdict.corrected_value)) !== JSON.stringify(normalizeFact(c.attribute, c.value)) ? (verdict.corrected_value as object) : null, ambiguity: c.ambiguity });
        facts++;
        byMethod[c.method] = (byMethod[c.method] ?? 0) + 1;
        routing[s.routing] = (routing[s.routing] ?? 0) + 1;
      }
      for (const attribute of routed.gaps)
        await tx.insert(schema.intakeReviews).values({ dealId, documentVersionId: ctx.documentVersionId, segmentId: segment.id, attribute, type: "extraction_gap", reason: `The extractor found no value for ${attribute}, which a rule reads from this document type.` }).onConflictDoNothing();
      // A40 on image-only pages: a model-read last four that disagrees with the assigned party goes to review.
      for (const c of candidates.filter((x) => x.method === "vision" && FACTS[x.attribute]!.value_type === "identifier" && segment.partyId)) {
        const [party] = await tx.select().from(schema.parties).where(eq(schema.parties.id, segment.partyId!));
        const lastFour = (c.value as { last_four?: string } | null)?.last_four;
        if (party?.identifierLastFour && lastFour && party.identifierLastFour !== lastFour)
          await tx.insert(schema.intakeReviews).values({ dealId, documentVersionId: ctx.documentVersionId, segmentId: segment.id, attribute: c.attribute, type: "identifier_mismatch", priority: "high", reason: "The identifier read from the image does not match the assigned party." }).onConflictDoNothing();
      }
      if (candidates.some((c) => c.attribute === "ownership.members")) await resolveOwnership(tx, dealId, segment.partyId, ctx.documentVersionId, segment.id);
      await tx.insert(schema.events).values({ dealId, actorId: context.user.id, action: "facts_extracted", entityType: "segment", entityId: segment.id, maskedAfter: { facts, byMethod, routing, gaps: routed.gaps.length, superseded: previous.length } });
      return { segmentId: segment.id, facts, byMethod, routing, gaps: routed.gaps, modelCalls };
    });
  });
}
