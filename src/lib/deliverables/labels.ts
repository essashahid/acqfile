/** Readable words for the codes stored in a frozen package. Presentation only. */
const STATUS: Record<string, string> = {
  satisfied: "Satisfied",
  missing: "Missing",
  needs_review: "Needs review",
  received_with_issues: "Received with issues",
  not_applicable: "Not applicable",
  waived: "Waived",
  open: "Open",
  requested: "Requested",
  resolved: "Resolved",
  dismissed: "Dismissed",
  conflict: "Documents disagree",
  info: "For information",
  blocker: "Blocks the file",
  major: "Major",
  minor: "Minor",
  preparation: "Preparation",
  later_lender: "Later lender work",
  unknown: "Stage not confirmed",
  accepted: "Accepted by a reviewer",
  auto_accepted: "Accepted automatically",
  edited: "Corrected by a reviewer",
  pending: "Awaiting review",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
  not_ordered: "Not yet ordered",
};

export function statusLabel(code: string | null | undefined): string {
  if (!code) return "";
  return STATUS[code] ?? code.charAt(0).toUpperCase() + code.slice(1).replaceAll("_", " ");
}

const ACTION: Record<string, string> = {
  portal_answer: "Answer recorded",
  snapshot_created: "Lender-file version created",
  segment_superseded: "Document replaced by a newer copy",
  fact_accept: "Value accepted",
  fact_edit_accept: "Value corrected",
  fact_reject: "Value rejected",
  fact_needs_source: "Value sent back for a source",
  fact_entered: "Value entered by hand",
  finding_dismiss: "Item dismissed",
  finding_waive: "Item waived",
  finding_resolved: "Item resolved",
  request_marked_sent: "Request recorded as sent",
  facts_extracted: "Values read from a document",
  segments_finalized: "Document filing confirmed",
  portal_link_created: "Personal link created",
  portal_link_revoked: "Personal link revoked",
  original_opened: "Original document opened",
};

export function actionLabel(action: string): string {
  return ACTION[action] ?? action.charAt(0).toUpperCase() + action.slice(1).replaceAll("_", " ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "27 Sep 2026, 14:05 UTC". Frozen times are stored in UTC and shown in UTC. */
export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Strip the engine's "fail:"/"unknown:" prefixes from a stored check message. */
export function checkSentence(message: string): string[] {
  return message
    .split(/;\s*(?=(?:fail|unknown|pass):)/i)
    .map((part) => {
      const m = part.match(/^(fail|unknown|pass):\s*([\s\S]*)$/i);
      if (!m) return part.trim();
      return m[1]!.toLowerCase() === "unknown" ? `Not yet known: ${m[2]!.trim()}` : m[2]!.trim();
    })
    .filter(Boolean);
}

// ── Format 3 presentation. New functions only: the labels above are also read by the frozen
// format-2 renderer, so their existing output must not change. ───────────────────────────────

/** What a recorded answer is, in every format-3 surface that shows one. */
export const ANSWER_MEANING =
  "A recorded answer captures the reviewer’s preferred value and reason. It does not change the supporting documents or close the disagreement.";

/** A consistency rule's title states the condition that should hold ("Purchase prices agree").
 * While the disagreement is open it must read as the problem, never as a passed check. */
export function problemTitle(title: string, status: string): string {
  if (!["open", "requested"].includes(status)) return title;
  const base = title.replace(/:\s*for lender review$/i, "");
  const m = base.match(/^(.*?)\s+(agrees|agree|equals|equal|remains|remain)\b(.*)$/i);
  if (!m) return title;
  const [, subject, verb, rest] = m;
  const stem = verb!.toLowerCase().replace(/s$/, "");
  const aux = /s$/i.test(verb!) ? "does not" : "do not";
  // "agrees and totals 100" -> "does not agree or total 100"
  const tail = rest!.replace(/^\s+and\s+(\w+?)s\b/i, " or $1");
  return `${subject} ${aux} ${stem}${tail}`;
}

const TRACKING: Record<string, string> = {
  not_started: "Not started",
  ordered: "Ordered",
  received: "Received",
};

/** Status of later lender work as recorded by hand; nothing recorded is not "received". */
export function laterWorkStatus(status: string, tracking: string | null | undefined): string {
  if (status === "not_applicable") return "Not applicable";
  if (tracking && TRACKING[tracking]) return TRACKING[tracking]!;
  if (status === "satisfied") return "Satisfied";
  return "Not recorded";
}

/** What later lender work needs, from its recorded tracking state and open checks. Says an
 * item was received only when receipt is recorded, and whether a document is in the package. */
export function laterWorkDetail(row: {
  status: string;
  tracking?: string | null;
  checks?: { type: string; result: string; message: string }[];
  filed?: boolean;
  decision_reason?: string;
}): string {
  if (row.status === "not_applicable") return row.decision_reason || "Not required for this deal.";
  const confirm = (row.checks ?? [])
    .filter((c) => c.type !== "tracking" && c.result !== "pass")
    .map((c) => `${c.message.replace(/\.$/, "")}.`);
  const inPackage = row.filed
    ? "A document is filed in this package."
    : "Not included in this preparation package.";
  const tracked =
    row.tracking === "received"
      ? `Recorded as received by the lender. ${inPackage}`
      : row.tracking === "ordered"
        ? `Ordered by the lender; not yet received. ${inPackage}`
        : row.tracking === "not_started"
          ? `Lender-ordered item; recorded as not started. ${inPackage}`
          : row.filed
            ? `Lender-ordered item; no tracking status recorded. ${inPackage}`
            : "Lender-ordered item; not included in this preparation package.";
  return [...confirm, tracked].join(" ");
}

/** A compared value as a reader sees it, from the catalog value type. Identifiers are never
 * formatted as numbers. */
export function typedValue(value: unknown, type: string | undefined): string {
  if (value === null || value === undefined || value === "") return "Not stated";
  if (type === "money") {
    const amount =
      typeof value === "object" && value && "amount" in value
        ? Number((value as { amount: unknown }).amount)
        : Number(value);
    if (Number.isFinite(amount))
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(amount);
  }
  if (type === "identifier" || type === "masked_identifier") {
    const last =
      typeof value === "object" && value && "last_four" in value
        ? String((value as { last_four: unknown }).last_four)
        : String(value).slice(-4);
    return `ending ${last}`;
  }
  if (type === "percent" && typeof value === "number") return `${value}%`;
  if (type === "owners" && Array.isArray(value))
    return value
      .map(
        (o: { name?: string; percent?: number }) => `${o.name ?? "Unnamed"} ${o.percent ?? "?"}%`,
      )
      .join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en-US").format(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return `${d} ${MONTHS[m! - 1]} ${y}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => typedValue(v, undefined)).join("; ");
  if (typeof value === "object") return readableRecord(value as Record<string, unknown>);
  return String(value);
}

/** Stored keys that are references, keyed hashes or secrets: never shown to a reader. */
const HIDDEN_KEY = /(^id$|Id$|_id$|hmac|hash|token|secret|password)/i;
const MONEY_KEY = /(amount|balance|payment|price|total|value)$/i;

/** A stored record as words: "Senior loan $900,000"; "Creditor: First Bank; Balance: $250,000". */
function readableRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record).filter(
    ([k, v]) => !HIDDEN_KEY.test(k) && v !== null && v !== undefined && v !== "",
  );
  const shown = (k: string, v: unknown) =>
    typedValue(v, MONEY_KEY.test(k) && typeof v === "number" ? "money" : undefined);
  // A labelled amount reads as the label and the amount.
  if (entries.length === 2 && "label" in record && "amount" in record)
    return `${String(record.label)} ${shown("amount", record.amount)}`;
  if ("last_four" in record && entries.length === 1) return `ending ${String(record.last_four)}`;
  return entries
    .map(
      ([k, v]) => `${k.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())}: ${shown(k, v)}`,
    )
    .join("; ");
}
