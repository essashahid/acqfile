import type { dealView } from "./deal-view";
import type { IndexRow } from "@/lib/deliverables/index-build";
import { documentName } from "./labels";

/** A current copy may explain an unmet requirement without satisfying it. Presentation only. */
export function requirementEvidence(v: Awaited<ReturnType<typeof dealView>>, row: IndexRow) {
  const rule = v.rules.get(row.item_id);
  if (!rule || row.status === "not_applicable") return row.segments;
  const sources = v.deal.profileJson.equity_sources;
  const source = Array.isArray(sources) ? sources.find((s) => s.id === row.scope_key) : undefined;
  const party = source?.party ?? row.scope_key;
  const account = source?.source_account_last_four;
  const related = v.segments.filter(
    (s) =>
      rule.accepts.some((type) => type === s.docType) &&
      (!row.period || s.period === row.period) &&
      (!v.parties.some((p) => p.id === party) || s.partyId === party) &&
      (!account ||
        account === "unknown" ||
        s.docType !== "BANK_STATEMENT" ||
        s.accountLastFour === account),
  );
  return [
    ...row.segments,
    ...related
      .filter((s) => !row.segments.some((x) => x.id === s.id))
      .map((s) => ({
        id: s.id,
        versionId: s.documentVersionId,
        page: s.pageStart,
        label: documentName(s.docType),
      })),
  ];
}
