import type { Rule } from "@/lib/rules/schema";
import type { IndexRow } from "./index-build";

export const SAMPLE_BOUNDARY = "Illustrative checklist, awaiting lender review";
export const stageOf = (rule: Rule | undefined) => rule?.submission_stage ?? "unknown";
export const knownResponsibility = (role: string | undefined) =>
  !!role?.trim() && !/^(unknown|unassigned|none|needs assignment)\b/i.test(role.trim());
const closed = (status: string) => ["satisfied", "waived", "not_applicable"].includes(status);

export type PreparationReadiness = {
  ready: boolean;
  current: boolean;
  label: string;
  policy: string;
  satisfied: number;
  waived: number;
  notApplicable: number;
  applicable: number;
  unresolved: string[];
  later: { item: string; title: string; subject: string; responsible: string; status: string }[];
};

/** One preparation boundary for staff, adviser and frozen exports. Ownership never sets the stage. */
export function preparationReadiness({
  index,
  rules,
  findings,
  current,
  reviewIssues = [],
}: {
  index: IndexRow[];
  rules: Map<string, Rule>;
  findings: {
    ruleId: string;
    status: string;
    severity: string;
    type: string;
    responsibleRole?: string;
  }[];
  current: boolean;
  reviewIssues?: string[];
}): PreparationReadiness {
  const applicable = index.filter((r) => r.status !== "not_applicable");
  const preparation = applicable.filter((r) => stageOf(rules.get(r.item_id)) !== "later_lender");
  const required = preparation.filter((r) => rules.get(r.item_id)?.required !== false);
  const unresolved = [...reviewIssues];
  if (!current) unresolved.unshift("Current evidence is awaiting evaluation.");
  if (!index.length) unresolved.push("No evaluated preparation requirements.");
  for (const row of applicable) {
    const rule = rules.get(row.item_id);
    if (stageOf(rule) === "unknown" || !knownResponsibility(row.responsible ?? rule?.responsible))
      unresolved.push(`${row.item}: staff must confirm the submission stage and responsibility.`);
    if (stageOf(rule) !== "later_lender" && rule?.required !== false && !closed(row.status))
      unresolved.push(
        `${row.item} · ${row.party}${row.period ? ` · ${row.period}` : ""}: ${row.status}`,
      );
  }
  for (const finding of findings.filter((f) => ["open", "requested"].includes(f.status))) {
    // The engine owns this explicit informational reminder; an uncertain pack still blocks.
    if (finding.ruleId === "PACK-01" && finding.type === "info" && finding.severity === "info")
      continue;
    const rule = rules.get(finding.ruleId);
    // Unknown rules are reviewed even if their severity is informational.
    if (
      stageOf(rule) === "unknown" ||
      !knownResponsibility(finding.responsibleRole ?? rule?.responsible) ||
      (stageOf(rule) !== "later_lender" && finding.severity !== "info" && finding.type !== "info")
    )
      unresolved.push(`${rule?.title ?? finding.ruleId}: unresolved ${finding.type}.`);
  }
  const ready = unresolved.length === 0;
  return {
    ready,
    current,
    label: ready
      ? "Prepared for lender review"
      : current
        ? "Preparation work outstanding"
        : "Awaiting current evaluation",
    policy: SAMPLE_BOUNDARY,
    satisfied: required.filter((r) => r.status === "satisfied").length,
    waived: required.filter((r) => r.status === "waived").length,
    notApplicable: index.filter((r) => r.status === "not_applicable").length,
    applicable: required.length,
    unresolved: [...new Set(unresolved)],
    later: applicable
      .filter((r) => stageOf(rules.get(r.item_id)) === "later_lender")
      .map((r) => ({
        item: r.item_id,
        title: r.item,
        subject: r.party,
        responsible:
          r.responsible ?? rules.get(r.item_id)?.responsible ?? "Unassigned — needs assignment",
        status: r.status,
      })),
  };
}
