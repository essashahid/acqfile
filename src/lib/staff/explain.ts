import type { Check, Expr, Rule } from "@/lib/rules/schema";
import { rowPreparationEffect, stageOf } from "@/lib/deliverables/readiness";
import { attributeName, documentName } from "./labels";

/**
 * What one review item means for the operator: the specific open check, what is known, and the
 * existing screen that resolves it. Presentation only; it reads the rule, the stored check results
 * and saved attestations and never changes them.
 */
export type CheckResult = { type: string; result: string; message: string };
export type SavedAttestation = {
  kind: string;
  key: string;
  state: string | null;
  confirmed: boolean | null;
  note: string;
};
export type Tone = "ok" | "warn" | "bad" | "quiet" | "accent";
export type CheckLine = {
  type: string;
  result: string;
  /** Distinct words for a failed check and one that could not be confirmed yet. */
  label: string;
  tone: Tone;
  text: string;
  /** A saved note or state that belongs to this check. */
  saved?: string;
  noteKey?: string;
};
export type ActionKind =
  | "confirm"
  | "tracking"
  | "document"
  | "values"
  | "follow-ups"
  | "documents"
  | "profile"
  | "none";
export type Explanation = {
  /** The single most useful sentence about this item. */
  summary: string;
  /** Checks that are not met or not confirmed, failed ones first. */
  open: CheckLine[];
  passed: CheckLine[];
  /** Extra fact an operator needs, such as an unverified configuration note. */
  note?: string;
  action: { kind: ActionKind; label: string; noteKey?: string };
  family:
    | "missing"
    | "proposed"
    | "applicability"
    | "manual"
    | "tracking"
    | "document"
    | "value"
    | "disagreement"
    | "relationship"
    | "closed"
    | "info"
    | "other";
};

/** Lower-case the first letter of prose, but leave acronyms such as "IRS" or "SBA" alone. */
const lowerFirst = (t: string) =>
  t && !/^[A-Z]{2}/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
const upperFirst = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** "…: for lender review" is a pack annotation, not part of the condition. */
const condition = (message: string) =>
  message
    .replace(/^(fail|pass|unknown|missing):\s*/i, "")
    .replace(/:\s*for lender review$/i, "")
    .replace(/[.;\s]+$/, "")
    .trim();
const joinOr = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
const joinAnd = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const field = (attribute: string) => lowerFirst(attributeName(attribute).split(" · ").at(-1)!);

/** Manual checks the packs define, each in words that describe the actual task. */
const MANUAL: Record<string, { task: string; action: string; done: string; note?: string }> = {
  personal_license: {
    task: "Confirm whether the business uses the seller's personal license. Record what you agreed with the lender.",
    action: "Record license review",
    done: "Completed means you checked whose license the business operates under and discussed it with the lender. Write the answer and the arrangement in the note. It is not a yes or no about the license.",
  },
  citizenship_handling: {
    task: "Confirm with the lender how they want citizenship evidence handled for this person, and record their response.",
    action: "Record lender response",
    done: "Completed means the lender's response is written in the note. It is not a decision about citizenship or eligibility.",
    note: "AcqFile does not decide citizenship or eligibility. The rule pack says this rule was reported as under legal challenge; that is an unverified configuration note, not a statement of current law.",
  },
  valuation_required: {
    task: "Ask the lender whether an independent business valuation is required, and record the answer.",
    action: "Record lender answer",
    done: "Completed means the lender's answer is written in the note.",
  },
  franchise_directory: {
    task: "Check the brand against the current SBA Franchise Directory and record what you found.",
    action: "Record directory check",
    done: "Completed means the directory check is done and the result is written in the note.",
  },
};

/** What saving "Completed" on a manual check records, so the control is never read as a yes/no answer. */
export const manualMeaning = (noteKey: string) =>
  MANUAL[noteKey]?.done ?? "Completed means this check is done and the note records the outcome.";

const TRACKING_STATE: Record<string, string> = {
  not_started: "Not started",
  ordered: "Ordered",
  received: "Received",
};

/** One check in words. Failed means the evidence contradicts the check; not confirmed means unknown. */
export function describeCheck(
  rule: Pick<Rule, "title" | "accepts">,
  check: CheckResult,
  definition: Partial<Check> | undefined,
  parameters: Record<string, unknown> = {},
  saved: SavedAttestation[] = [],
): CheckLine {
  const result = check.result;
  const base = {
    type: check.type,
    result,
    label: result === "pass" ? "Met" : result === "fail" ? "Not met" : "Not confirmed yet",
    tone: (result === "pass" ? "ok" : result === "fail" ? "bad" : "warn") as Tone,
  };
  const cond = condition(check.message);
  const doc = rule.accepts.length ? lowerFirst(documentName(rule.accepts[0]!)) : "document";
  const docs = joinOr(rule.accepts.map((t) => lowerFirst(documentName(t))));
  if (check.type === "manual_confirmation") {
    const key = definition?.note_key ?? "";
    const known = MANUAL[key];
    const record = saved.find((a) => a.kind === "manual_confirmation" && a.key === key);
    const task =
      known?.task ??
      (/\?/.test(cond)
        ? `Answer and record: ${cond.replace(/\?\s*/, "? ")}`
        : `Record the outcome of this manual check: ${lowerFirst(cond)}.`);
    return {
      ...base,
      label: result === "pass" ? "Completed" : result === "fail" ? "Not completed" : "Not recorded",
      tone: result === "pass" ? "ok" : "warn",
      text: task,
      noteKey: key,
      saved: record
        ? `${record.confirmed ? "Recorded as completed" : "Recorded as not completed"}: ${record.note}`
        : "Nothing has been recorded yet.",
    };
  }
  if (check.type === "tracking") {
    const record = saved.find((a) => a.kind === "tracking");
    const state = record?.state ? TRACKING_STATE[record.state] : null;
    return {
      ...base,
      label: state ?? "Not recorded",
      tone: result === "pass" ? "ok" : state ? "accent" : "warn",
      text: `The lender orders the ${lowerFirst(rule.title)}. Record whether it has been ordered or received.`,
      saved: record
        ? `Status recorded as ${state?.toLowerCase()}: ${record.note}`
        : "No tracking status has been recorded yet. That does not mean the lender has not ordered it.",
    };
  }
  if (result === "pass") return { ...base, text: upperFirst(cond) + "." };
  const fail = result === "fail";
  switch (check.type) {
    case "presence": {
      if (fail) return { ...base, text: `No ${docs} on file.` };
      const facts = definition?.facts ?? [];
      return {
        ...base,
        text: facts.length
          ? `A ${doc} is on file, but ${joinAnd(facts.map(field))} ${facts.length === 1 ? "has" : "have"} not been read or confirmed.`
          : `A ${doc} is on file, but the documents cover different dates, so the period could not be matched.`,
      };
    }
    case "period_coverage":
      return { ...base, text: `No ${docs} on file for the required period.` };
    case "freshness": {
      const date = definition?.metadata
        ? definition.metadata.replace("_", " ")
        : definition?.fact
          ? field(definition.fact)
          : "date";
      const days = definition?.max_age_param ? parameters[definition.max_age_param] : undefined;
      return {
        ...base,
        text: fail
          ? `The ${date} is older than the ${days ?? "configured"}-day limit for this file.`
          : `The ${date} has not been read or confirmed, so its age cannot be checked.`,
      };
    }
    case "signed_and_dated":
      return {
        ...base,
        text: definition?.signed_only
          ? fail
            ? "The document is recorded as not signed."
            : "Whether the document is signed has not been confirmed."
          : fail
            ? "The document is recorded as not signed or not dated."
            : "The signature or its date has not been confirmed on the document on file.",
      };
    case "page_completeness":
      return {
        ...base,
        text: fail
          ? "The pages filed do not match the form's own page count (Page X of Y)."
          : "The form's expected page count has not been read.",
      };
    case "form_revision": {
      const revision = definition?.revision_param
        ? parameters[definition.revision_param]
        : undefined;
      return {
        ...base,
        text: fail
          ? `The form revision is not the configured revision${revision ? ` (${revision})` : ""}.`
          : "The form revision has not been read.",
      };
    }
    case "fact_agreement": {
      const mode = definition?.mode ?? "values";
      if (mode === "owners")
        return {
          ...base,
          text: fail
            ? "Owners or percentages on the documents do not match the declared ownership, or do not total 100%."
            : "Some owners or percentages have not been confirmed.",
        };
      if (mode === "party_assignment")
        return {
          ...base,
          text: "At least one filed document is not assigned to a person or business in this deal.",
        };
      if (mode !== "values")
        return {
          ...base,
          text: fail
            ? "The name on the document does not match the party in this deal."
            : "The name on the document has not been confirmed.",
        };
      return {
        ...base,
        text: fail
          ? "The sources give different values."
          : "One of the values to compare has not been confirmed.",
      };
    }
    default: {
      if (/lease and options cover the review horizon/i.test(cond))
        return {
          ...base,
          text: fail
            ? `The lease end date, including renewal options, does not cover the configured review period${parameters.lease_years ? ` (${parameters.lease_years} years)` : ""}.`
            : "The lease end date or renewal options have not been confirmed, so coverage of the review period cannot be checked.",
        };
      return {
        ...base,
        text: fail
          ? `This does not hold for the values on file: ${lowerFirst(cond)}.`
          : `A value needed for this check has not been confirmed: ${lowerFirst(cond)}.`,
      };
    }
  }
}

const RELATIONSHIP = ["arithmetic", "fact_comparison", "date_order"];

/** The row-level explanation shared by Requirements, Review and the document context panel. */
export function explainItem({
  rule,
  status,
  checks,
  findingType,
  findingMessage,
  parameters = {},
  saved = [],
}: {
  rule: Rule;
  status: string;
  checks: CheckResult[];
  findingType?: string;
  findingMessage?: string;
  parameters?: Record<string, unknown>;
  saved?: SavedAttestation[];
}): Explanation {
  const docs = joinOr(rule.accepts.map((t) => lowerFirst(documentName(t))));
  const lines = checks.map((c, i) => {
    const def =
      rule.checks[i]?.type === c.type && rule.checks[i]?.message === c.message
        ? rule.checks[i]
        : rule.checks.find((d) => d.type === c.type && d.message === c.message);
    return describeCheck(rule, c, def, parameters, saved);
  });
  const open = [
    ...lines.filter((l) => l.result === "fail"),
    ...lines.filter((l) => l.result !== "fail" && l.result !== "pass"),
  ];
  const passed = lines.filter((l) => l.result === "pass");
  const none = { kind: "none" as const, label: "" };
  if (status === "not_applicable")
    return {
      summary: "The deal profile makes this requirement not applicable.",
      open,
      passed,
      action: { kind: "profile", label: "Open profile" },
      family: "closed",
    };
  if (status === "waived")
    return {
      summary: "Waived with a recorded reason.",
      open,
      passed,
      action: none,
      family: "closed",
    };
  if (status === "satisfied")
    return {
      summary: "Every check is met by the evidence on file.",
      open,
      passed,
      action: none,
      family: "closed",
    };
  if (findingType === "info" || (status === "received_with_issues" && !open.length))
    return {
      summary: "For information. The current rules do not ask for anything more.",
      open,
      passed,
      action: none,
      family: "info",
    };
  if (!checks.length) {
    if (/^Proposed evidence awaits confirmation/i.test(findingMessage ?? ""))
      return {
        summary: `A matching document (${docs}) was uploaded, but its filing has not been confirmed.`,
        open,
        passed,
        action: { kind: "documents", label: "Confirm document filing" },
        family: "proposed",
      };
    if (/applicability needs review/i.test(findingMessage ?? ""))
      return {
        summary: "Whether this requirement applies depends on deal details that are not known yet.",
        open,
        passed,
        action: { kind: "profile", label: "Complete deal profile" },
        family: "applicability",
      };
    return {
      summary: rule.accepts.length ? `No ${docs} on file.` : `${rule.title} has not been recorded.`,
      open,
      passed,
      action: { kind: "follow-ups", label: "Prepare follow-up request" },
      family: "missing",
    };
  }
  const first = open[0];
  if (!first) return { summary: "No open check.", open, passed, action: none, family: "other" };
  const definition = rule.checks.find((c) => c.type === first.type);
  const manualNote = MANUAL[first.noteKey ?? ""]?.note;
  if (first.type === "manual_confirmation")
    return {
      summary: first.text,
      open,
      passed,
      note: manualNote,
      action: {
        kind: "confirm",
        label: MANUAL[first.noteKey ?? ""]?.action ?? "Record this check",
        noteKey: first.noteKey,
      },
      family: "manual",
    };
  if (first.type === "tracking")
    return {
      summary: first.text,
      open,
      passed,
      action: { kind: "tracking", label: "Update lender tracking" },
      family: "tracking",
    };
  if (
    ["signed_and_dated", "page_completeness", "form_revision", "period_coverage"].includes(
      first.type,
    )
  )
    return {
      summary: first.text,
      open,
      passed,
      action: { kind: "document", label: "Edit document details" },
      family: "document",
    };
  if (first.type === "fact_agreement") {
    const mode = definition?.mode ?? "values";
    if (mode === "party_assignment" || mode === "party_name" || mode === "account_holder")
      return {
        summary: first.text,
        open,
        passed,
        action: { kind: "document", label: "Edit document details" },
        family: "document",
      };
    return {
      summary: first.text,
      open,
      passed,
      action:
        first.result === "fail"
          ? { kind: "values", label: "Compare values with their sources" }
          : { kind: "values", label: "Review values" },
      family: first.result === "fail" ? "disagreement" : "value",
    };
  }
  if (RELATIONSHIP.includes(first.type))
    return {
      summary: first.text,
      open,
      passed,
      action:
        first.result === "fail"
          ? { kind: "follow-ups", label: "Prepare clarification request" }
          : { kind: "values", label: "Review values" },
      family: first.result === "fail" ? "relationship" : "value",
    };
  if (first.type === "freshness" && first.result === "fail")
    return {
      summary: first.text,
      open,
      passed,
      action: { kind: "follow-ups", label: "Request a newer copy" },
      family: "document",
    };
  return {
    summary: first.text,
    open,
    passed,
    action: { kind: "values", label: "Review values" },
    family: "value",
  };
}

/** Link for an action. Every target is an existing screen on this deal. */
export function actionHref(
  kind: ActionKind,
  base: string,
  target: {
    rowKey?: string;
    noteKey?: string;
    show?: string;
    findingKey?: string;
    document?: { versionId: string; page: number; segmentId?: string };
  },
): string | null {
  const row = target.rowKey ? encodeURIComponent(target.rowKey) : "";
  const context = [
    target.findingKey ? `finding=${encodeURIComponent(target.findingKey)}` : "",
    row ? `row=${row}` : "",
  ]
    .filter(Boolean)
    .join("&");
  switch (kind) {
    case "confirm":
      return row
        ? `${base}/requirements?show=${target.show ?? "all"}&focus=${row}#${controlId("confirm", target.rowKey!, target.noteKey)}`
        : null;
    case "tracking":
      return row
        ? `${base}/requirements?show=${target.show ?? "all"}&focus=${row}#${controlId("tracking", target.rowKey!)}`
        : null;
    case "document":
      return target.document
        ? `${base}/documents/${target.document.versionId}?page=${target.document.page}${context ? `&${context}` : ""}`
        : `${base}/documents`;
    case "values":
      return target.document?.segmentId
        ? `${base}/documents/${target.document.versionId}/values/${target.document.segmentId}`
        : target.document
          ? `${base}/documents/${target.document.versionId}?page=${target.document.page}${context ? `&${context}` : ""}`
          : `${base}/documents`;
    case "follow-ups":
      return `${base}/follow-ups`;
    case "documents":
      return `${base}/documents`;
    case "profile":
      return `${base}/profile`;
    default:
      return null;
  }
}

/** Stable DOM id for a Requirements control so a link can open and scroll to it. */
export const controlId = (kind: "confirm" | "tracking", rowKey: string, noteKey = "") =>
  `${kind}-${`${rowKey}${noteKey ? `-${noteKey}` : ""}`.replace(/[^A-Za-z0-9_-]+/g, "-")}`;

/** How this row affects preparation, from the same test the readiness calculation uses. */
export function stageEffect(rule: Rule | undefined, row: { status: string; responsible?: string }) {
  const stage = stageOf(rule);
  const effect = rowPreparationEffect(row, rule);
  if (effect.unconfigured)
    return {
      stage,
      blocks: true,
      text: "Stage or responsibility is not configured. Until staff confirm it, this stops the file from being prepared.",
    };
  if (effect.outstanding)
    return { stage, blocks: true, text: "Must be completed before the file can be prepared." };
  if (["satisfied", "waived", "not_applicable"].includes(row.status))
    return { stage, blocks: false, text: "" };
  if (stage === "later_lender")
    return {
      stage,
      blocks: false,
      text: "Later lender work. It does not stop the file from being prepared.",
    };
  return { stage, blocks: false, text: "Optional. It does not stop the file from being prepared." };
}

/** Readable priority. The stored severity is unchanged; this only names it. */
export const PRIORITY: Record<string, string> = {
  blocker: "Top priority",
  major: "High priority",
  minor: "Normal priority",
  info: "For information",
};
export const PRIORITY_HELP =
  "Priority comes from the rule and orders the review list. Whether an item stops the file from being prepared is shown separately.";

/** Deal-profile inputs a rule's checks actually read, so the screen never claims more. */
export function profileDependencies(rule: Rule | undefined): string[] {
  if (!rule) return [];
  const found = new Set<string>();
  const walk = (e: Expr | undefined) => {
    if (!e || typeof e !== "object") return;
    if (Array.isArray(e)) return;
    if ("profile" in e) found.add(profileLabel(e.profile));
    if ("op" in e) e.args.forEach(walk);
  };
  for (const c of rule.checks) {
    if (c.profile) found.add(profileLabel(c.profile));
    walk(c.expr);
    walk(c.when);
    if (c.mode === "owners") found.add("Declared post-closing ownership");
    if (c.mode === "party_name" || c.mode === "account_holder" || c.mode === "buyer_seller")
      found.add("Party names in the deal profile");
  }
  return [...found];
}
const profileLabel = (path: string) =>
  upperFirst(path.replace(/\[\]/g, "").split(".").join(" ").replaceAll("_", " "));

/**
 * The checks a finding recorded when it was raised, read from its stored message. History uses
 * this so a closed item is described as it was, not by today's results.
 */
export function checksFromMessage(rule: Rule | undefined, message: string): CheckResult[] {
  if (!rule?.checks) return [];
  return message
    .split(/;\s*(?=(?:fail|unknown):)/i)
    .map((part) => part.match(/^(fail|unknown):\s*([\s\S]*)$/i))
    .flatMap((m) => {
      const definition = m && rule.checks.find((c) => c.message === m[2]!.trim());
      return definition
        ? [{ type: definition.type, result: m![1]!.toLowerCase(), message: definition.message }]
        : [];
    });
}

/** Only a path inside this deal's Review or Requirements screen is used as a way back. */
export function safeReturn(base: string, raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw, "http://acqfile.local");
    if (url.origin !== "http://acqfile.local") return null;
    if (![`${base}/review`, `${base}/requirements`].includes(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
