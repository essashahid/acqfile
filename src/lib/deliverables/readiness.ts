import type { Rule } from "@/lib/rules/schema";
import type { IndexRow } from "./index-build";
import { checkSentence, statusLabel } from "./labels";

export const SAMPLE_BOUNDARY = "Illustrative checklist, awaiting lender review";
export const stageOf = (rule: Rule | undefined) => rule?.submission_stage ?? "unknown";
export const knownResponsibility = (role: string | undefined) =>
  !!role?.trim() && !/^(unknown|unassigned|none|needs assignment)\b/i.test(role.trim());
const closed = (status: string) => ["satisfied", "waived", "not_applicable"].includes(status);

/** How one applicable row affects preparation. Screens explain a row with this same test. */
export function rowPreparationEffect(
  row: Pick<IndexRow, "status" | "responsible">,
  rule: Rule | undefined,
) {
  if (row.status === "not_applicable") return { unconfigured: false, outstanding: false };
  return {
    unconfigured:
      stageOf(rule) === "unknown" || !knownResponsibility(row.responsible ?? rule?.responsible),
    outstanding:
      stageOf(rule) !== "later_lender" && rule?.required !== false && !closed(row.status),
  };
}

/** Whether an open or requested finding stops preparation. Unknown rules are reviewed even if informational. */
export function findingStopsPreparation(
  finding: { status: string; severity: string; type: string; responsibleRole?: string },
  rule: Rule | undefined,
) {
  return (
    stageOf(rule) === "unknown" ||
    !knownResponsibility(finding.responsibleRole ?? rule?.responsible) ||
    (stageOf(rule) !== "later_lender" && finding.severity !== "info" && finding.type !== "info")
  );
}

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
  /** Presentation of the same unresolved work, one entry per requirement, person and period.
   * Absent from versions frozen before it existed. Never used to decide readiness. */
  groups?: OutstandingGroup[];
  later: { item: string; title: string; subject: string; responsible: string; status: string }[];
};

export type OutstandingGroup = {
  key: string;
  title: string;
  subject: string;
  period: string;
  status: string;
  reasons: string[];
};

/** The rows the "N of M" preparation count is made of, so any view of them uses the same set. */
export function requiredPreparationRows(index: IndexRow[], rules: Map<string, Rule>) {
  return index
    .filter((r) => r.status !== "not_applicable")
    .filter((r) => stageOf(rules.get(r.item_id)) !== "later_lender")
    .filter((r) => rules.get(r.item_id)?.required !== false);
}

/** One preparation boundary for staff, adviser and frozen exports. Ownership never sets the stage. */
export function preparationReadiness({
  index,
  rules,
  findings,
  current,
  reviewIssues = [],
  subjectOf = (key) => key,
}: {
  index: IndexRow[];
  rules: Map<string, Rule>;
  findings: {
    ruleId: string;
    status: string;
    severity: string;
    type: string;
    responsibleRole?: string;
    scopeKey?: string;
    period?: string | null;
    detailsJson?: unknown;
  }[];
  current: boolean;
  reviewIssues?: string[];
  subjectOf?: (scopeKey: string) => string;
}): PreparationReadiness {
  const applicable = index.filter((r) => r.status !== "not_applicable");
  const required = requiredPreparationRows(index, rules);
  const unresolved = [...reviewIssues];
  // Same membership as `unresolved`, keyed by requirement, person and period, so a row and the
  // open checks on it read as one item and two people or periods never collapse into one.
  const groups = new Map<string, OutstandingGroup>();
  const group = (key: string, base: Omit<OutstandingGroup, "key" | "reasons">, reason?: string) => {
    const g = groups.get(key) ?? { key, ...base, reasons: [] };
    if (reason && !g.reasons.includes(reason)) g.reasons.push(reason);
    groups.set(key, g);
  };
  const general = { title: "Document review", subject: "", period: "", status: "Needs review" };
  for (const issue of reviewIssues) group(`review|${issue}`, general, issue);
  if (!current) {
    unresolved.unshift("Current evidence is awaiting evaluation.");
    group(
      "evaluation",
      { ...general, title: "Evaluation" },
      "Current evidence is awaiting evaluation.",
    );
  }
  if (!index.length) {
    unresolved.push("No evaluated preparation requirements.");
    group("index", { ...general, title: "Evaluation" }, "No evaluated preparation requirements.");
  }
  for (const row of applicable) {
    const rule = rules.get(row.item_id);
    const effect = rowPreparationEffect(row, rule);
    const key = `${row.item_id}|${row.scope_key}|${row.period}`;
    const base = {
      title: row.item,
      subject: row.party,
      period: row.period,
      status: statusLabel(row.status),
    };
    if (effect.unconfigured) {
      unresolved.push(`${row.item}: staff must confirm the submission stage and responsibility.`);
      group(key, base, "Staff must confirm the submission stage and responsibility.");
    }
    if (effect.outstanding) {
      unresolved.push(
        `${row.item} · ${row.party}${row.period ? ` · ${row.period}` : ""}: ${row.status}`,
      );
      const reasons = (row.checks ?? [])
        .filter((c) => c.result !== "pass")
        .map((c) => (c.result === "unknown" ? `Not yet known: ${c.message}` : c.message));
      group(key, base);
      for (const reason of reasons.length ? reasons : [statusLabel(row.status)])
        group(key, base, reason);
    }
  }
  for (const finding of findings.filter((f) => ["open", "requested"].includes(f.status))) {
    // The engine owns this explicit informational reminder; an uncertain pack still blocks.
    if (finding.ruleId === "PACK-01" && finding.type === "info" && finding.severity === "info")
      continue;
    const rule = rules.get(finding.ruleId);
    if (findingStopsPreparation(finding, rule)) {
      unresolved.push(`${rule?.title ?? finding.ruleId}: unresolved ${finding.type}.`);
      const scope = finding.scopeKey ?? "";
      const period = finding.period ?? "";
      const message = (finding.detailsJson as { message?: string } | null)?.message ?? "";
      const key = `${finding.ruleId}|${scope}|${period}`;
      const row = groups.get(key);
      group(
        key,
        row ?? {
          title: rule?.title ?? finding.ruleId,
          subject: scope ? subjectOf(scope) : "",
          period,
          status: statusLabel(finding.type === "needs_review" ? "needs_review" : finding.type),
        },
      );
      for (const reason of message ? checkSentence(message) : [statusLabel(finding.type)])
        group(key, row ?? groups.get(key)!, reason);
    }
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
    // A reason that only repeats the status adds nothing once a specific reason exists.
    groups: [...groups.values()].map((g) => {
      const reasons = g.reasons.map((r) => (/^Missing: /.test(r) ? "Not on file." : r));
      const specific = reasons.filter((r) => r !== g.status);
      return { ...g, reasons: [...new Set(specific.length ? specific : reasons)] };
    }),
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
