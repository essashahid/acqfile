import { ReviewInputError } from "./review-error";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db/client";
import { parsedVersion } from "@/lib/deals/blocks";
import { scrubPayload } from "@/lib/deals/identifiers";
import type { Candidate } from "./candidate";
import { validateCandidates } from "./validate";

export const SourceInput = z.object({
  page: z.number().int().positive(),
  quote: z.string().trim().min(1).max(1000),
  kind: z.enum(["quote", "transcription"]).default("quote"),
  region: z.string().trim().min(1).max(200).optional(),
});
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Rebuild provenance from the authorized source version; never carry a corrected value's old locator. */
export async function validateManual(
  tx: Tx,
  segment: typeof schema.segments.$inferSelect,
  attribute: string,
  value: unknown,
  source: z.infer<typeof SourceInput>,
) {
  if (!segment.isCurrent || segment.status !== "confirmed")
    throw new ReviewInputError("File this current segment before reviewing values.");
  if (source.page < segment.pageStart || source.page > segment.pageEnd)
    throw new ReviewInputError("Page lies outside the segment");
  const parsed = await parsedVersion(segment.documentVersionId);
  if (!parsed)
    throw new ReviewInputError(
      "Source pages are unavailable. Reopen review until the document can be inspected.",
    );
  const quote = scrubPayload(source.quote);
  const blocks = parsed.blocks.filter((b) => b.page === source.page);
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const block =
    source.kind === "quote"
      ? blocks.find((b) => normalize(b.text).includes(normalize(quote)))
      : (blocks.find((b) => b.kind === "page") ?? blocks[0]);
  if (!block)
    throw new ReviewInputError(
      "Quote was not found on this page. Choose the supporting page and exact text, or label an image read as a transcription.",
    );
  if (source.kind === "transcription" && !source.region)
    throw new ReviewInputError(
      "Describe the source region for a transcription (for example, cash field).",
    );
  const candidate: Candidate = {
    attribute,
    value,
    method: source.kind === "quote" ? "text" : "vision",
    raw: null,
    source_block_ids: [block.locator],
    quote,
    page: source.page,
    region: source.region ?? null,
    ambiguity: null,
  };
  const siblings = await tx
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.segmentId, segment.id), eq(schema.facts.isCurrent, true)));
  const candidates = [
    candidate,
    ...siblings
      .filter(
        (f) => f.attribute !== attribute && ["accepted", "auto_accepted"].includes(f.routingStatus),
      )
      .map((f) => ({ ...candidate, attribute: f.attribute, value: f.valueJson })),
  ];
  const validations = validateCandidates(
    candidates,
    parsed.blocks,
    segment.pageStart,
    segment.pageEnd,
  );
  const relevant = validations.filter(
    (v) =>
      v.attribute === attribute ||
      v.messages.some((m) => ["pfs_totals_disagree", "total_disagrees_with_rows"].includes(m.code)),
  );
  const errors = relevant.flatMap((v) =>
    v.messages.filter((m) => m.level === "error").map((m) => `${v.attribute}: ${m.code}`),
  );
  if (errors.length)
    throw new ReviewInputError(`Correct the value before saving: ${errors.join(", ")}`);
  const validation = validations[0]!;
  return {
    locator: {
      file: segment.documentVersionId,
      page: source.page,
      source_block: block.locator,
      quote,
      verbatim: source.kind === "quote",
      ...(source.region ? { region: source.region } : {}),
    },
    validation,
    confidence: String(0.5 * validation.score + 0.5 * validation.exact),
    components: { deterministic_validation: validation.score, exact_evidence: validation.exact },
  };
}
