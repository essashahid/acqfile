import type { Expr, Rule } from "@/lib/rules/schema";
import { FACTS } from "@/lib/domain/registry";
import { attributeName, documentName, factValue } from "./labels";

/**
 * Both sides of a disagreement, read from what the finding recorded when it was raised: the
 * declared profile value, each document value with its quote and page, and any configured limit.
 * Presentation only; nothing here re-evaluates a rule or changes a stored value.
 */
export type Detail = {
  fact_id: string | null;
  value: unknown;
  file: string;
  page: number | null;
  quote: string;
};
export type Side = {
  source: "document" | "profile" | "limit";
  /** "Purchase agreement", "Deal profile" or "Configured limit". */
  label: string;
  /** The field compared, such as "Structure" or "Expiry". */
  field: string;
  value: string;
  quote?: string;
  page?: number | null;
  versionId?: string;
  filename?: string;
  /** "E-signed 31 Aug 2026" when the same document's signature was recorded with the item. */
  signed?: string;
};
type Context = {
  segments: { documentVersionId: string; pageStart: number; pageEnd: number; docType: string }[];
  facts: { id: string; attribute: string; unit: string; valueJson: unknown }[];
  versions: { id: string; sourceFilename: string | null }[];
  parameters: Record<string, unknown>;
};

const PROFILE_FILE = "Declared deal profile";
/** A few stored words read better as the phrase an operator uses. */
const WORDS: Record<string, Record<string, string>> = {
  structure: { asset: "Asset purchase", stock: "Stock purchase", merger: "Merger" },
};
const upperFirst = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const squash = (v: unknown) =>
  (typeof v === "string" ? v : JSON.stringify(v ?? "")).toLowerCase().replace(/[^a-z0-9]/g, "");
const lastPart = (attribute: string) => attributeName(attribute).split(" · ").at(-1)!;

/** Every operand the rule's checks read, so the screen shows the inputs the check actually used. */
function operands(rule: Rule) {
  const found = { profile: new Set<string>(), fact: new Set<string>(), param: new Set<string>() };
  const walk = (e: Expr | undefined) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return;
    if ("profile" in e) found.profile.add(e.profile);
    if ("fact" in e) found.fact.add(e.fact);
    if ("param" in e) found.param.add(e.param);
    if ("op" in e) e.args.forEach(walk);
  };
  for (const c of rule.checks) {
    walk(c.expr);
    if (c.fact) found.fact.add(c.fact);
  }
  return found;
}

const readPath = (object: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (at, key) =>
        at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined,
      object,
    );

const limitText = (name: string, value: unknown) => {
  if (typeof value !== "number") return String(value);
  const unit = name.match(/_(years|months|days)$/)?.[1];
  return unit
    ? `${value} ${value === 1 ? unit.slice(0, -1) : unit}`
    : value.toLocaleString("en-US");
};

export function comparisonSides(rule: Rule | undefined, details: Detail[], ctx: Context): Side[] {
  if (!rule) return [];
  const used = operands(rule);
  const sides: Side[] = [];
  const profile = details.find((d) => d.file === PROFILE_FILE)?.value;
  for (const path of used.profile) {
    const raw = readPath(profile, path);
    if (raw === undefined || raw === null || typeof raw === "object") continue;
    const key = path.split(".").at(-1)!;
    sides.push({
      source: "profile",
      label: "Deal profile",
      field: upperFirst(key.replaceAll("_", " ")),
      value: WORDS[key]?.[String(raw)] ?? upperFirst(String(raw)),
    });
  }
  const seen = new Set<string>();
  for (const d of details) {
    if (d.fact_id === null || d.page === null) continue;
    const id = `${d.fact_id}:${squash(d.value)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const fact = ctx.facts.find((f) => f.id === d.fact_id);
    const attribute = fact?.attribute ?? "";
    const unit = fact?.unit ?? FACTS[attribute]?.unit ?? "text";
    // The item stores a normalised copy for comparison; show the fact's own words when they match.
    const shown = fact && squash(fact.valueJson) === squash(d.value) ? fact.valueJson : d.value;
    const key = attribute.split(".").at(-1)!;
    const segment = ctx.segments.find(
      (s) => s.documentVersionId === d.file && s.pageStart <= d.page! && s.pageEnd >= d.page!,
    );
    const signature = details.find(
      (x) =>
        x.fact_id === null &&
        x.file === d.file &&
        x.value &&
        typeof x.value === "object" &&
        "signed" in (x.value as object),
    )?.value as { signed?: boolean; signature_date?: string } | undefined;
    sides.push({
      source: "document",
      label: segment ? documentName(segment.docType) : "Supplied document",
      field: attribute ? lastPart(attribute) : "Value",
      value: WORDS[key]?.[String(shown)] ?? factValue(attribute, unit, shown),
      quote: d.quote,
      page: d.page,
      versionId: ctx.versions.some((v) => v.id === d.file) ? d.file : undefined,
      filename: ctx.versions.find((v) => v.id === d.file)?.sourceFilename ?? undefined,
      signed: signature?.signed
        ? `E-signed${signature.signature_date ? ` ${factValue("", "date", signature.signature_date)}` : ""}`
        : undefined,
    });
  }
  // A date-order check needs a span to be reached; a comparison stays within a limit.
  const lead = rule.checks.some((c) => c.type === "date_order") ? "needs" : "limit";
  for (const name of used.param) {
    if (!(name in ctx.parameters)) continue;
    sides.push({
      source: "limit",
      label: lead,
      field: upperFirst(name.replaceAll("_", " ")),
      value: limitText(name, ctx.parameters[name]),
    });
  }
  return sides;
}

const shortValue = (v: string) => (v.length > 32 && v.includes(",") ? v.split(",")[0]! : v);

/**
 * One line for a work list: "Profile: Asset purchase · Purchase agreement p.1: Stock purchase".
 * Documents that give the same value are counted once.
 */
export function comparisonLine(sides: Side[]): string {
  if (sides.filter((s) => s.source !== "limit").length < 1) return "";
  const fields = new Set(sides.filter((s) => s.source === "document").map((s) => s.field));
  const parts: string[] = [];
  for (const s of sides.filter((x) => x.source === "profile"))
    parts.push(`Profile: ${shortValue(s.value)}`);
  const docs = sides.filter((s) => s.source === "document");
  if (docs.length === sides.length && fields.size === 1) {
    // Several documents, one field: name each value once, with the documents that give it.
    const byValue = new Map<string, Side[]>();
    for (const s of docs) {
      const k = squash(shortValue(s.value));
      byValue.set(k, [...(byValue.get(k) ?? []), s]);
    }
    return [...byValue.values()]
      .sort((a, b) => a.length - b.length)
      .map((group) => {
        const names = [...new Set(group.map((s) => s.label))].map((label) => {
          const n = new Set(group.filter((s) => s.label === label).map((s) => s.versionId)).size;
          return n > 1 ? `${label} (${n})` : label;
        });
        const lower = names.map((n, i) => (i ? n.charAt(0).toLowerCase() + n.slice(1) : n));
        return `${lower.join(", ")}: ${shortValue(group[0]!.value)}`;
      })
      .join(" · ");
  }
  const byLabel = new Map<string, Side[]>();
  for (const s of docs) byLabel.set(s.label, [...(byLabel.get(s.label) ?? []), s]);
  for (const [label, group] of byLabel) {
    const values = [
      ...new Set(
        group.map((s) =>
          fields.size > 1 ? `${s.field.toLowerCase()} ${shortValue(s.value)}` : shortValue(s.value),
        ),
      ),
    ];
    const pages = [...new Set(group.map((s) => s.page))];
    const copies = new Set(group.map((s) => s.versionId)).size;
    const name = copies > 1 ? `${label} (${copies})` : label;
    parts.push(
      `${name}${pages.length === 1 && copies === 1 && pages[0] ? ` p.${pages[0]}` : ""}: ${values.join(", ")}`,
    );
  }
  for (const s of sides.filter((x) => x.source === "limit")) parts.push(`${s.label} ${s.value}`);
  return parts.join(" · ");
}

/** The same comparison as a sentence for the Review detail. */
export function comparisonSentence(sides: Side[]): string {
  const profile = sides.filter((s) => s.source === "profile");
  const docs = sides.filter((s) => s.source === "document");
  const limits = sides.filter((s) => s.source === "limit");
  const say = (s: Side) =>
    `${s.label === "Deal profile" ? "The deal profile" : `The ${s.label.toLowerCase()}`}`;
  if (profile.length && docs.length)
    return `${say(profile[0]!)} says ${profile[0]!.value.toLowerCase()}. ${say(docs[0]!)} says ${docs[0]!.value.toLowerCase()}.`;
  const groups = valueGroups(docs);
  if (!limits.length && groups.length > 1)
    return `${groups.map((g) => `${upperFirst(g.names)}: ${shortValue(g.value)}`).join(". ")}.`;
  if (limits.length && docs.length)
    return `${say(docs[0]!)} gives ${docs.map((s) => `${s.field.toLowerCase()} ${s.value}`).join(" and ")}; the checklist ${limits[0]!.label === "needs" ? "looks for" : "allows up to"} ${limits.map((l) => l.value).join(", ")}.`;
  return "";
}

/**
 * Document sides that read one field, gathered by value: each distinct value once, with the
 * documents that give it. Fewer sources first, so the odd one out leads.
 */
export function valueGroups(docs: Side[]) {
  const byValue = new Map<string, Side[]>();
  for (const s of docs) {
    const k = squash(shortValue(s.value));
    byValue.set(k, [...(byValue.get(k) ?? []), s]);
  }
  return [...byValue.values()]
    .sort((a, b) => a.length - b.length)
    .map((group) => {
      const labels = [...new Set(group.map((s) => s.label))];
      const names = labels
        .map((label) => {
          const n = new Set(group.filter((s) => s.label === label).map((s) => s.versionId)).size;
          return n > 1 ? `${n} ${label.toLowerCase()}s` : label.toLowerCase();
        })
        .join(" and ");
      return { value: group[0]!.value, names, sides: group };
    });
}
