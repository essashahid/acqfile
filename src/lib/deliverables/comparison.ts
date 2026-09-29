import { FACTS } from "@/lib/domain/registry";
import { labelFor } from "@/lib/portal/copy";
import type { Rule } from "@/lib/rules/schema";
import { typedValue } from "./labels";

/** One value in a frozen comparison, as the lender reads it. */
export type ComparisonSide = {
  /** Readable source: the document's name, or "Deal profile". */
  source: string;
  /** The stored value, kept for provenance. */
  value: string;
  /** The value in words: "$1,050,000", "ending 4321", "31 Aug 2026". */
  display: string;
  file: string;
  page: number | null;
  quote: string;
  package_path?: string;
};

/** Evidence the check consulted that is not itself a compared value (document signature
 * details, the rule parameters applied). Kept for audit; never mixed into the comparison. */
export type ConsultedEvidence = {
  kind: string;
  file: string;
  page: number | null;
  quote: string;
  package_path: string;
  detail: string;
};

type Detail = {
  fact_id: string | null;
  value: unknown;
  file: string;
  page: number | null;
  quote: string;
};
type Expr = { fact?: string; profile?: string; param?: string; args?: unknown[] } | unknown;

/** The facts, profile keys and parameters a rule's checks actually compare. */
export function comparedTerms(rule: Rule | undefined) {
  const facts = new Set<string>();
  const profile = new Set<string>();
  const params = new Set<string>();
  const walk = (e: Expr) => {
    if (!e || typeof e !== "object") return;
    const x = e as { fact?: string; profile?: string; param?: string; args?: unknown[] };
    if (x.fact) facts.add(x.fact);
    if (x.profile) profile.add(x.profile);
    if (x.param) params.add(x.param);
    for (const a of x.args ?? []) walk(a);
  };
  for (const c of rule?.checks ?? []) {
    const check = c as {
      fact?: string;
      profile?: string;
      tolerance_param?: string;
      expr?: unknown;
    };
    if (check.fact) facts.add(check.fact);
    if (check.profile) profile.add(check.profile);
    if (check.tolerance_param) params.add(check.tolerance_param);
    walk(check.expr);
  }
  return { facts, profile, params };
}

/** "deal.purchase_price" -> "purchase price", for "so the cited sources show the same …". */
export function comparedLabel(rule: Rule | undefined): string | null {
  const agreement = (rule?.checks ?? [])
    .filter((c) => c.type === "fact_agreement")
    .map((c) => (c as { fact?: string }).fact)
    .filter((f): f is string => !!f);
  if (!agreement.length) return null;
  return [...new Set(agreement.map((f) => (f.split(".")[1] ?? f).replaceAll("_", " ")))].join(
    " and ",
  );
}

const lookup = (object: Record<string, unknown>, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined),
      object,
    );

const words = (key: string) => key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Split a finding's engine details into the values the rule compares and the rest. The engine
 * attaches every accepted document's signature details and the whole declared profile to every
 * finding; a price disagreement should show prices, not those.
 */
export function comparison(input: {
  rule: Rule | undefined;
  details: Detail[];
  facts: { id: string; attribute: string; segmentId: string | null }[];
  segments: { id: string; docType: string }[];
  profile: Record<string, unknown>;
  parameters: Record<string, unknown>;
  fileName: (versionId: string) => string;
  packagePath: (versionId: string) => string;
  partyName: (id: string | null) => string;
}): { sides: ComparisonSide[]; consulted: ConsultedEvidence[] } {
  const terms = comparedTerms(input.rule);
  const sides: (ComparisonSide & { type?: string })[] = [];
  const consulted: ConsultedEvidence[] = [];
  let firstType: string | undefined;
  for (const d of input.details) {
    const file = input.fileName(d.file);
    const packagePath = input.packagePath(d.file);
    if (d.fact_id) {
      const fact = input.facts.find((f) => f.id === d.fact_id);
      if (fact && terms.facts.size && !terms.facts.has(fact.attribute)) {
        consulted.push({
          kind: "Other value read",
          file,
          page: d.page,
          quote: d.quote,
          package_path: packagePath,
          detail: `${words(fact.attribute.split(".")[1] ?? fact.attribute)}: ${typedValue(d.value, FACTS[fact.attribute]?.value_type)}`,
        });
        continue;
      }
      const type = fact ? FACTS[fact.attribute]?.value_type : undefined;
      firstType ??= type;
      const segment = input.segments.find((s) => s.id === fact?.segmentId);
      sides.push({
        type: segment?.docType,
        source: segment ? labelFor(segment.docType) : "Document",
        value: typeof d.value === "string" ? d.value : JSON.stringify(d.value),
        display: typedValue(d.value, type),
        file,
        page: d.page,
        quote: d.quote,
        package_path: packagePath,
      });
      continue;
    }
    if (d.file === "Declared deal profile") {
      const used = [...terms.params]
        .map((p) => `${words(p)}: ${typedValue(input.parameters[p], undefined)}`)
        .join("; ");
      consulted.push({
        kind: "Deal profile",
        file: "Deal profile",
        page: null,
        quote: "",
        package_path: "",
        detail: used
          ? `Declared deal profile; rule settings applied: ${used}`
          : "Declared deal profile",
      });
      continue;
    }
    const v = (d.value ?? {}) as {
      signed?: boolean | null;
      dated?: boolean | null;
      signature_date?: string | null;
      period?: string | null;
      party_id?: string | null;
    };
    const yesNo = (b: boolean | null | undefined) =>
      b === true ? "Yes" : b === false ? "No" : "Not known";
    consulted.push({
      kind: "Document details",
      file,
      page: d.page,
      quote: d.quote,
      package_path: packagePath,
      detail: [
        `Signed: ${yesNo(v.signed)}`,
        `Dated: ${yesNo(v.dated)}`,
        `Signature date: ${v.signature_date ? typedValue(v.signature_date, "date") : "Not stated"}`,
        `Period: ${v.period ?? "Not stated"}`,
        `Filed to: ${input.partyName(v.party_id ?? null)}`,
      ].join("; "),
    });
  }
  // Documents in the order the rule names them (letter of intent, purchase agreement, …).
  const across = (input.rule?.checks ?? []).flatMap(
    (c) => (c as { across?: string[] }).across ?? [],
  );
  const rank = (s: ComparisonSide & { type?: string }) => {
    const i = s.type ? across.indexOf(s.type) : -1;
    return i < 0 ? across.length : i;
  };
  sides.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
  for (const s of sides as (ComparisonSide & { type?: string })[]) delete s.type;
  // The declared value the rule compares, when it compares one: "Deal profile: $1,000,000".
  for (const key of terms.profile) {
    if (key.includes("[]")) continue;
    const value = lookup(input.profile, key);
    if (value === undefined || value === null || value === "") continue;
    sides.push({
      source: "Deal profile",
      value: typeof value === "string" ? value : JSON.stringify(value),
      display: typedValue(value, firstType),
      file: "Deal profile",
      page: null,
      quote: "",
      package_path: "",
    });
  }
  return { sides: sides as ComparisonSide[], consulted };
}
