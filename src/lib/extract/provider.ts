import type { DocumentType, FactDefinition } from "@/lib/domain/registry";
import type { PromptBlock, VerifyPromptItem } from "./prompts";
import type { ExtractionOutput, VerificationOutput } from "./schema";
export type Usage = { model: string; inputTokens: number; outputTokens: number; latencyMs: number; cost: number };
export type ExtractRequest = {
  hash: string;
  docType: DocumentType;
  pageStart: number;
  pageEnd: number;
  fields: FactDefinition[];
  blocks: PromptBlock[];
  imagePages: number[];
  /** A33 sub-PDF of the image-only pages, native PDF input for the provider. */
  pdf: Buffer | null;
  /** Vision reads twice; the passes must be independent. */
  pass: 1 | 2;
};
export type ExtractResponse = { output: ExtractionOutput; usage: Usage };
export type VerifyRequest = { hash: string; pageStart: number; items: VerifyPromptItem[]; pdf: Buffer | null };
export type VerifyResponse = { output: VerificationOutput; usage: Usage };
export interface ExtractionProvider {
  name: string;
  models: { extract: string; verify: string };
  extract(request: ExtractRequest): Promise<ExtractResponse>;
  verify(request: VerifyRequest): Promise<VerifyResponse>;
}
