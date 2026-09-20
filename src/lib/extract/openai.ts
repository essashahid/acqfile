import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import { estimateCostUsd } from "@/lib/config";
import {
  EXTRACTOR_SYSTEM_PROMPT,
  VERIFIER_SYSTEM_PROMPT,
  extractorUserPrompt,
  verifierUserPrompt,
} from "./prompts";
import { ExtractionOutputSchema, VerificationOutputSchema } from "./schema";
import type { ExtractionProvider } from "./provider";
/** Live provider. The verifier runs on a different model and never sees the extractor's confidence. */
export function createOpenAiExtractionProvider(): ExtractionProvider {
  const e = env();
  if (!e.OPENAI_API_KEY) throw Error("Live extraction requires an owner-supplied provider key");
  if (e.OPENAI_EXTRACT_MODEL === e.OPENAI_VERIFY_MODEL)
    throw Error("Extractor and verifier must use different models");
  const client = new OpenAI({ apiKey: e.OPENAI_API_KEY, maxRetries: 0, timeout: 90000 });
  async function call<T>(
    model: string,
    system: string,
    user: string,
    pdf: Buffer | null,
    format: Parameters<typeof zodTextFormat>[0],
    name: string,
  ) {
    const started = Date.now();
    const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: user }];
    if (pdf)
      content.push({
        type: "input_file",
        filename: "pages.pdf",
        file_data: `data:application/pdf;base64,${pdf.toString("base64")}`,
      });
    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      text: { format: zodTextFormat(format, name) },
      max_output_tokens: 8000,
      store: false,
    });
    const inputTokens = response.usage?.input_tokens ?? 0,
      outputTokens = response.usage?.output_tokens ?? 0;
    return {
      output: JSON.parse(response.output_text) as T,
      usage: {
        model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        cost: estimateCostUsd(model, inputTokens, outputTokens),
      },
    };
  }
  return {
    name: "openai",
    models: { extract: e.OPENAI_EXTRACT_MODEL, verify: e.OPENAI_VERIFY_MODEL },
    async extract(request) {
      const r = await call(
        e.OPENAI_EXTRACT_MODEL,
        EXTRACTOR_SYSTEM_PROMPT,
        extractorUserPrompt(request.docType, request.fields, request.blocks, request.imagePages),
        request.pdf,
        ExtractionOutputSchema,
        "extraction",
      );
      return { output: ExtractionOutputSchema.parse(r.output), usage: r.usage };
    },
    async verify(request) {
      const r = await call(
        e.OPENAI_VERIFY_MODEL,
        VERIFIER_SYSTEM_PROMPT,
        verifierUserPrompt(request.items),
        request.pdf,
        VerificationOutputSchema,
        "verification",
      );
      return { output: VerificationOutputSchema.parse(r.output), usage: r.usage };
    },
  };
}
