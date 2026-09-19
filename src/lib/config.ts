import { env, retryDelaysMs } from "@/lib/env";

/** Pipeline constants. Anything that changes model behaviour is folded into the model config hash. */
export const PIPELINE_VERSION = env().PIPELINE_VERSION;
export const SCHEMA_VERSION = "record-v2";
export const EXTRACT_PROMPT_VERSION = env().EXTRACT_PROMPT_VERSION;
export const VERIFY_PROMPT_VERSION = env().VERIFY_PROMPT_VERSION;

export const UPLOAD_LIMITS = {
  maxBytes: env().MAX_UPLOAD_MB * 1024 * 1024,
  maxPages: env().MAX_DOCUMENT_PAGES,
  allowedMimeTypes: {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  } as const,
};

/** Scanned-document heuristic: more than 50% of pages with fewer than 100 characters. */
export const SCANNED_DETECTION = { minCharsPerPage: 100, maxLowTextPageRatio: 0.5 };

export const CONFIDENCE_WEIGHTS = {
  evidence_exact_match: 0.3,
  deterministic_validation: 0.2,
  verifier_support: 0.25,
  cross_pass_agreement: 0.15,
  evidence_specificity: 0.1,
} as const;

export const ROUTING_THRESHOLDS = { autoAccept: env().AUTO_ACCEPT_THRESHOLD, review: env().REVIEW_THRESHOLD } as const;

export const VERIFIER_BATCH_SIZE = 12;

export const RETRY_SCHEDULE_MS: readonly number[] = retryDelaysMs().slice(0, env().LLM_MAX_RETRIES);
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;

/** Demo-corpus cost warning threshold (spec section 39). */
export const COST_WARNING_USD = 0.25;

/**
 * Provider/model prices in USD per 1M tokens. Central configuration, not business logic.
 * Update here when OpenAI changes list prices.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  mock: { input: 0, output: 0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) throw new Error(`Configure token pricing for model ${model} before using it.`);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Regression rules (spec section 33). */
export const REGRESSION_RULES = {
  extractionExactAccuracyDropPct: 2,
  provenanceValidityDropPct: 1,
  reviewRecallDropPct: 5,
} as const;

/** Success criteria (spec section 5). */
export const SUCCESS_TARGETS = {
  scalarExactAccuracy: 0.95,
  listMicroF1: 0.9,
  classificationAccuracy: 0.95,
  provenanceValidity: 0.98,
  reviewRecall: 0.9,
  reviewPrecision: 0.75,
} as const;
