import { env } from "@/lib/env";
import { hashObject } from "@/lib/hash";
import { EXTRACT_PROMPT_VERSION, PIPELINE_VERSION, SCHEMA_VERSION, VERIFY_PROMPT_VERSION } from "@/lib/config";
import { createMockProvider } from "./mock";
import { createOpenAiProvider } from "./openai";
import type { LlmModels, LlmProvider } from "./types";

let cached: LlmProvider | null = null;
let cachedKey = "";

export function llmModelsFromEnv(): LlmModels {
  const e = env();
  if (e.LLM_PROVIDER === "mock") return { extract: "mock", verify: "mock" };
  return { extract: e.OPENAI_EXTRACT_MODEL, verify: e.OPENAI_VERIFY_MODEL };
}

export function getLlm(): LlmProvider {
  const e = env();
  const key = `${e.LLM_PROVIDER}:${JSON.stringify(llmModelsFromEnv())}`;
  if (cached && cachedKey === key) return cached;
  cached = e.LLM_PROVIDER === "mock" ? createMockProvider(llmModelsFromEnv()) : createOpenAiProvider({ apiKey: e.OPENAI_API_KEY ?? "", models: llmModelsFromEnv() });
  cachedKey = key;
  return cached;
}

/** Model, prompt versions, generation parameters and schema version, hashed (spec section 36). */
export function modelConfigHash(provider: LlmProvider = getLlm()): string {
  return hashObject({
    provider: provider.name,
    models: provider.models,
    pipelineVersion: PIPELINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    prompts: { extract: EXTRACT_PROMPT_VERSION, verify: VERIFY_PROMPT_VERSION },
    validationRevision: "audit-v2",
    generation: { temperature: "default", structuredOutput: true },
  }).slice(0, 16);
}

export function modelConfigSummary(provider: LlmProvider = getLlm()) {
  return { provider: provider.name, models: provider.models, pipelineVersion: PIPELINE_VERSION, schemaVersion: SCHEMA_VERSION, prompts: { extract: EXTRACT_PROMPT_VERSION, verify: VERIFY_PROMPT_VERSION } };
}

export type { LlmProvider } from "./types";
