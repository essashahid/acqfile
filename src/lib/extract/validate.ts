import { FACTS } from "@/lib/domain/registry";
import type { Source } from "@/lib/deals/parse";
import { normalizeText } from "@/lib/text";
import type { Candidate, Validation, ValidationMessage } from "./candidate";
import { valueValid } from "./values";
const plausibleDate = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  Number(v.slice(0, 4)) >= 1990 &&
  Number(v.slice(0, 4)) <= 2100;
/** Deterministic validation before confidence (Phase 4 Step A.3). Runs on every candidate, every method. */
export function validateCandidates(
  candidates: Candidate[],
  blocks: Source[],
  pageStart: number,
  pageEnd: number,
): Validation[] {
  const byAttribute = new Map(candidates.map((c) => [c.attribute, c]));
  return candidates.map((c) => {
    const def = FACTS[c.attribute]!;
    const messages: ValidationMessage[] = [];
    const error = (code: string) => messages.push({ code, level: "error" });
    const warning = (code: string) => messages.push({ code, level: "warning" });
    if (c.decode_error) error(c.decode_error);
    if (!valueValid(def, c.value)) error("type_invalid");
    if (def.value_type === "date" && !plausibleDate(c.value)) error("date_invalid");
    if (
      (def.value_type === "money" || def.value_type === "number") &&
      typeof c.value === "number"
    ) {
      if (!Number.isFinite(c.value) || Math.abs(c.value) >= 1e12) error("amount_implausible");
      if (def.unit === "percent" && (c.value < 0 || c.value > 100)) error("percent_range");
      if (def.unit === "months" && (c.value < 0 || !Number.isInteger(c.value)))
        error("months_invalid");
    }
    if (Array.isArray(c.value)) {
      const seen = new Set<string>();
      for (const item of c.value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) warning("duplicate_item");
        seen.add(key);
      }
      if (
        def.value_type === "owners" &&
        (c.value as { percent: number }[]).reduce((n, o) => n + o.percent, 0) > 100.01
      )
        error("owners_over_100");
    }
    if (c.ambiguity) warning("ambiguous_value");
    // Self-checks such as Form 413 totals and sources/uses sums.
    const number = (a: string) => {
      const v = byAttribute.get(a)?.value;
      return typeof v === "number" ? v : null;
    };
    if (
      c.attribute === "pfs.net_worth" &&
      number("pfs.total_assets") !== null &&
      number("pfs.total_liabilities") !== null &&
      typeof c.value === "number" &&
      Math.abs(number("pfs.total_assets")! - number("pfs.total_liabilities")! - c.value) > 1
    )
      error("pfs_totals_disagree");
    for (const [total, rows] of [
      ["funding.sources_total", "funding.sources"],
      ["funding.uses_total", "funding.uses"],
    ] as const)
      if (c.attribute === total && typeof c.value === "number") {
        const list = byAttribute.get(rows)?.value;
        if (
          Array.isArray(list) &&
          Math.abs((list as { amount: number }[]).reduce((n, r) => n + r.amount, 0) - c.value) > 1
        )
          error("total_disagrees_with_rows");
      }
    // Provenance: cited blocks exist and lie inside the segment; the quote occurs in a cited block.
    let locators_ok = true;
    let exact: 0 | 1 = 0;
    if (c.method !== "acroform" || c.source_block_ids.length) {
      if (!c.source_block_ids.length) {
        error("evidence_missing");
        locators_ok = false;
      }
      const cited = c.source_block_ids.map((id) => blocks.find((b) => b.locator === id));
      if (cited.some((b) => !b)) {
        error("evidence_locator_unknown");
        locators_ok = false;
      }
      if (cited.some((b) => b && (b.page < pageStart || b.page > pageEnd))) {
        error("evidence_outside_segment");
        locators_ok = false;
      }
      if (c.method === "vision") {
        if (!c.region) warning("region_missing");
        exact = 0;
      } else if (!c.quote) {
        error("evidence_quote_missing");
      } else if (cited.some((b) => b && normalizeText(b.text).includes(normalizeText(c.quote!))))
        exact = 1;
      else warning("evidence_quote_not_found");
    }
    if (c.method === "acroform" && !c.mapped) warning("acroform_mapping_unknown");
    const score: 1 | 0.5 | 0 = messages.some((m) => m.level === "error")
      ? 0
      : messages.length
        ? 0.5
        : 1;
    return { attribute: c.attribute, messages, score, exact, locators_ok };
  });
}
