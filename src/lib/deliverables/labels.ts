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
