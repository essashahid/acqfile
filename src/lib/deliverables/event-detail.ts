import { FACTS } from "@/lib/domain/registry";
import { documentName } from "@/lib/staff/labels";
import { statusLabel, typedValue } from "./labels";

const dateLabel = (iso: string) => typedValue(iso, "date");

/** What a readable event description may look up. Every lookup returns names, never ids. */
export type EventLookups = {
  /** Original filename of a document version, or null when unknown. */
  file: (versionId: string) => string | null;
  segment: (id: string) => { type: string; file: string | null } | null;
  fact: (id: string) => { attribute: string; value: unknown; file: string | null } | null;
  party: (id: string | null | undefined) => string;
  /** The question a portal task asked, when known. */
  question: (taskKey: string) => string | null;
};

type Event = {
  action: string;
  entityType: string;
  entityId: string | null;
  maskedAfter: unknown;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Keys that hold references to records, links or secrets rather than something a reader can use. */
const REFERENCE = /(^id$|Id$|_id$|Ids$|_ids$|^link$|token|hash$|Hash$|^hash)/;

/** Internal record references are never exported; this is the last guard, not the mechanism. */
export const withoutInternalIds = (text: string) => text.replace(UUID, "[internal reference]");

const words = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

const factName = (attribute: string) => words(attribute.split(".")[1] ?? attribute);
const factValue = (attribute: string, value: unknown) =>
  typedValue(value, FACTS[attribute]?.value_type);
const note = (text: unknown) => (typeof text === "string" && text ? ` — “${text}”` : "");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Readable key: value pairs from an event's details, leaving out every reference. */
function pairs(details: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (REFERENCE.test(key) || value === null || value === undefined || value === "") continue;
    if (typeof value === "string" && value.match(UUID)) continue;
    if (typeof value === "object") {
      if (Array.isArray(value) && value.every((v) => typeof v !== "object"))
        out.push(`${words(key)}: ${value.join(", ")}`);
      else if (!Array.isArray(value))
        for (const [k, v] of Object.entries(value as Record<string, unknown>))
          if (typeof v !== "object" && !REFERENCE.test(k)) out.push(`${words(k)}: ${String(v)}`);
      continue;
    }
    out.push(`${words(key)}: ${typeof value === "boolean" ? (value ? "Yes" : "No") : value}`);
  }
  return out.join("; ");
}

/**
 * A change-log line a lender can read: names of files, documents, values and people, never the
 * record ids the audit trail keeps. Finding decisions, answers and replacements are described
 * by the caller, which knows the findings; everything else is described here.
 */
export function eventDetail(e: Event, look: EventLookups): string {
  const after = (e.maskedAfter && typeof e.maskedAfter === "object" ? e.maskedAfter : {}) as Record<
    string,
    unknown
  >;
  const id = e.entityId ?? "";
  const file = (versionId: string) => look.file(versionId) ?? "A file";
  const party = () => look.party(after.partyId as string | undefined);
  const question = () => {
    const q = typeof after.taskKey === "string" ? look.question(after.taskKey) : null;
    return q ? ` — ${q}` : "";
  };
  let text: string;
  switch (e.action) {
    case "deal_created":
      text = `${after.code ?? ""} · ${after.name ?? ""}${after.as_of ? `; as of ${dateLabel(String(after.as_of))}` : ""}`;
      break;
    case "file_uploaded":
    case "duplicate_detected":
      text = `${file(id)}${after.batch ? ` (upload ${after.batch})` : ""}${e.action === "duplicate_detected" ? "; same content as an earlier upload" : ""}`;
      break;
    case "segments_finalized":
      text = `${file(id)}: ${plural(Number(after.segments ?? 0), "document")} filed`;
      break;
    case "segments_reviewed":
      text = `${file(id)}: filing reviewed${note(after.note)}`;
      break;
    case "original_opened":
      text = file(id);
      break;
    case "facts_extracted": {
      const segment = look.segment(id);
      const routing = (after.routing ?? {}) as Record<string, number>;
      const routed = Object.entries(routing)
        .filter(([, n]) => n)
        .map(([k, n]) => `${n} ${statusLabel(k).toLowerCase()}`);
      text = [
        `${segment ? `${documentName(segment.type)} in ${segment.file ?? "a file"}` : "A document"}: ${plural(Number(after.facts ?? 0), "value")} read`,
        ...routed,
        ...(after.gaps ? [`${after.gaps} not found`] : []),
      ].join("; ");
      break;
    }
    case "fact_entered": {
      const attribute = String(after.attribute ?? "");
      const segment = look.segment(id);
      text = `${factName(attribute)}: ${factValue(attribute, after.value)} — ${segment?.file ?? "a document"}${after.page ? `, page ${after.page}` : ""}${note(after.comment)}`;
      break;
    }
    case "fact_accept":
    case "fact_edit_accept":
    case "fact_reject":
    case "fact_needs_source":
    case "fact_reopen": {
      const fact = look.fact(id);
      if (!fact) {
        text = pairs(after);
        break;
      }
      const value = "value" in after ? after.value : fact.value;
      text = `${factName(fact.attribute)}: ${factValue(fact.attribute, value)}${fact.file ? ` — ${fact.file}` : ""}${note(after.comment)}`;
      break;
    }
    case "portal_link_created":
    case "portal_link_revoked":
      text = `For ${party()}`;
      break;
    case "portal_upload": {
      const count = Array.isArray(after.versions) ? after.versions.length : 0;
      text = `${party()}: ${plural(count, "file")} sent through their personal link${question()}${note(after.note)}`;
      break;
    }
    case "portal_cant_send":
      text = `${party()}: cannot send yet${question()}${after.reason ? `; ${String(after.reason)}` : ""}${after.date ? `; expected ${dateLabel(String(after.date))}` : ""}${note(after.note)}`;
      break;
    case "portal_reminder_sent":
      text = `${party()}${question()}`;
      break;
    case "snapshot_created":
      text = `Version ${after.number}; ${plural(Number(after.files ?? 0), "file")}`;
      break;
    default:
      if (e.action.startsWith("attestation_")) {
        const outcome =
          typeof after.state === "string"
            ? words(after.state)
            : after.confirmed === true
              ? "Confirmed"
              : after.confirmed === false
                ? "Not confirmed"
                : "";
        text = `${after.rule_id ?? ""} · ${look.party(after.scope_key as string)}${after.period ? ` · ${after.period}` : ""}${outcome ? `: ${outcome}` : ""}${note(after.note)}`;
        break;
      }
      text = pairs(after);
  }
  return withoutInternalIds(text).slice(0, 300);
}
