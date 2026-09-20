import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import { DOCUMENT_TYPES } from "@/lib/domain/registry";
import { estimateCostUsd } from "@/lib/config";
import { CLASSIFIER_PROMPT } from "./classifier-prompt";
import { ClassificationSchema, validateBoundaries, type Candidate } from "./classification";
import { scrubPayload } from "./identifiers";
import type { Parsed } from "./parse";
export type ClassificationCall = {
  segments: Candidate[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
};
// Runtime native PDF input only. No rasterizer, OCR executable or fixture renderer imported.
export async function subPdf(bytes: Buffer, pages: number[]) {
  const source = await PDFDocument.load(bytes);
  const target = await PDFDocument.create();
  for (const page of await target.copyPages(
    source,
    pages.map((p) => p - 1),
  ))
    target.addPage(page);
  return Buffer.from(await target.save());
}
export async function classifyFile(
  hash: string,
  parsed: Parsed,
  bytes: Buffer,
  provider = env().LLM_PROVIDER,
): Promise<ClassificationCall> {
  const started = Date.now();
  if (provider === "mock") {
    // Truth is accessible only inside this explicit mock-provider branch.
    for (const deal of ["deal-a", "deal-b", "deal-c"]) {
      const root = path.join(process.cwd(), "fixtures/deals", deal, "truth");
      const docs = JSON.parse(fs.readFileSync(path.join(root, "documents.json"), "utf8")) as {
        hash: string;
        segments: {
          page_start: number;
          page_end: number;
          doc_type: string;
          party_id: string;
          period: string | null;
          form_revision: string | null;
          signed: boolean | null;
          dated: boolean | null;
          signature_date: string | null;
          document_date: string | null;
          expected_page_count: number | null;
          account_last_four: string | null;
          metadata_locator: { quote: string; page: number };
        }[];
      }[];
      const match = docs.find((d) => d.hash === hash && d.segments.length);
      if (!match) continue;
      const profile = JSON.parse(fs.readFileSync(path.join(root, "deal.json"), "utf8"));
      const segments = match.segments.map((s) => ({
        ...s,
        party_name:
          profile.parties.find((p: { id: string }) => p.id === s.party_id)?.legal_name ??
          "Unmatched named party",
        period_raw: s.period,
        alternatives: [],
        quote: s.metadata_locator.quote,
        quote_page: s.metadata_locator.page,
        evidence: [
          {
            field: "signature",
            page: s.metadata_locator.page,
            quote: s.metadata_locator.quote,
          },
        ],
        uncertain: false,
      }));
      return {
        segments: validateBoundaries(
          ClassificationSchema.parse(scrubPayload({ segments })).segments,
          parsed.pages,
        ),
        model: "mock",
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        latencyMs: Date.now() - started,
      };
    }
    const segments = Array.from({ length: parsed.pages }, (_, i) => ({
      page_start: i + 1,
      page_end: i + 1,
      doc_type: "OTHER_NOT_REQUIRED",
      alternatives: [],
      party_name: null,
      period_raw: null,
      period: null,
      form_revision: null,
      signed: null,
      dated: null,
      signature_date: null,
      document_date: null,
      expected_page_count: null,
      account_last_four: null,
      quote: `Page ${i + 1}`,
      quote_page: i + 1,
      evidence: [],
      uncertain: true,
    }));
    return {
      segments: ClassificationSchema.parse({ segments }).segments,
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      latencyMs: Date.now() - started,
    };
  }
  const e = env();
  if (!e.OPENAI_API_KEY) throw Error("Live classifier requires an owner-supplied provider key");
  const model = e.OPENAI_EXTRACT_MODEL;
  estimateCostUsd(model, 0, 0);
  const client = new OpenAI({
    apiKey: e.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60000,
  });
  const needsPdf = parsed.blocks.some((b) => b.image_only);
  const content: OpenAI.Responses.ResponseInputContent[] = [
    {
      type: "input_text",
      text: JSON.stringify({
        doc_types: DOCUMENT_TYPES,
        instruction:
          "Classify metadata only. Return identifiers as last four only. Never infer a signature from a printed name. Image evidence uses page references.",
        pages: parsed.blocks,
      }),
    },
  ];
  if (needsPdf) {
    const pdf = await subPdf(
      bytes,
      Array.from({ length: parsed.pages }, (_, i) => i + 1),
    );
    content.push({
      type: "input_file",
      filename: "source.pdf",
      file_data: `data:application/pdf;base64,${pdf.toString("base64")}`,
    });
  }
  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: CLASSIFIER_PROMPT },
      { role: "user", content },
    ],
    text: { format: zodTextFormat(ClassificationSchema, "document_segments") },
    max_output_tokens: 5000,
    store: false,
  });
  const segments = validateBoundaries(
    ClassificationSchema.parse(scrubPayload(JSON.parse(response.output_text))).segments,
    parsed.pages,
  );
  const inputTokens = response.usage?.input_tokens ?? 0,
    outputTokens = response.usage?.output_tokens ?? 0;
  return {
    segments,
    model,
    inputTokens,
    outputTokens,
    cost: estimateCostUsd(model, inputTokens, outputTokens),
    latencyMs: Date.now() - started,
  };
}
