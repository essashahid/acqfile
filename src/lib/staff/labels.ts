import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/registry";

/**
 * Presentation vocabulary for the operator workspace. The domain keeps its enums; an operator
 * reads names. Nothing here changes a stored value, and the raw code stays available in details.
 */
const DOCUMENT_NAMES: Partial<Record<DocumentType, string>> = {
  SBA_1919: "SBA Form 1919",
  SBA_413: "SBA Form 413",
  SBA_159: "SBA Form 159",
  SBA_155: "SBA Form 155",
  TAX_PERSONAL: "Personal tax return",
  TAX_BUSINESS: "Business tax return",
  TAX_EXTENSION: "Tax filing extension",
  IRS_4506C: "IRS Form 4506-C",
  FIN_YEAR_END: "Year-end financial statements",
  FIN_INTERIM: "Interim financial statements",
  AGING_AR: "Accounts receivable aging",
  AGING_AP: "Accounts payable aging",
  DEBT_SCHEDULE: "Debt schedule",
  LOI: "Letter of intent",
  PURCHASE_AGREEMENT: "Purchase agreement",
  SOURCES_USES: "Sources and uses of funds",
  SELLER_NOTE: "Seller note",
  BANK_STATEMENT: "Bank statement",
  GIFT_LETTER: "Gift letter",
  LEASE: "Lease",
  LEASE_CONSENT: "Lease consent",
  OPERATING_AGREEMENT: "Operating agreement",
  EIN_LETTER: "EIN letter",
  GOV_ID: "Government photo ID",
  CITIZENSHIP_EVIDENCE: "Citizenship evidence",
  CONSULTING_AGREEMENT: "Consulting agreement",
  VALUATION: "Business valuation",
  QOE: "Quality of earnings report",
  RESUME: "Résumé",
  CREDIT_AUTH: "Credit report authorization",
  FORMATION_DOC: "Formation documents",
  GOOD_STANDING: "Certificate of good standing",
  OWNERSHIP_CHART: "Ownership chart",
  BUSINESS_PLAN: "Business plan",
  PROJECTIONS: "Financial projections",
  ADDBACK_SCHEDULE: "Add-back schedule",
  EQUIPMENT_LIST: "Equipment list",
  LICENSE: "License",
  FRANCHISE_AGREEMENT: "Franchise agreement",
  FRANCHISE_DISCLOSURE: "Franchise disclosure document",
  CIM: "Confidential information memorandum",
  ESCROW_EVIDENCE: "Escrow evidence",
  NON_COMPETE: "Non-compete agreement",
  RE_CONTRACT: "Real estate contract",
  TRANSFER_EVIDENCE: "Transfer evidence",
  INVENTORY_SUMMARY: "Inventory summary",
  KEY_CONTRACT: "Key contract",
  EMPLOYEE_ROSTER: "Employee roster",
  APPRAISAL: "Appraisal",
  ENVIRONMENTAL: "Environmental report",
  OTHER_NOT_REQUIRED: "Other, not required",
  UNREADABLE: "Could not be read",
};

/** Readable name for a document type; unmapped codes degrade to sentence case rather than shouting. */
export function documentName(type: string): string {
  return (
    DOCUMENT_NAMES[type as DocumentType] ??
    type
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
export const KNOWN_DOCUMENT_TYPES = DOCUMENT_TYPES.map((t) => ({
  id: t,
  name: documentName(t),
})).sort((a, b) => a.name.localeCompare(b.name));

/**
 * A finding headline an operator can read. The engine states the condition that should hold and
 * marks it failed, so the readable form is its negation, phrased as what could not be confirmed
 * rather than as an assertion about the document.
 */
export function findingHeadline(type: string, message: string): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Finding";
  const condition = raw.replace(/^(fail|pass|unknown|missing):\s*/i, "").trim();
  const lower = condition.charAt(0).toLowerCase() + condition.slice(1);
  const sentence = condition.charAt(0).toUpperCase() + condition.slice(1);
  // "Not on file: X" avoids guessing whether X is singular or plural.
  if (/^missing:/i.test(raw) || type === "missing") return `Not on file: ${sentence}`;
  if (type === "stale") return `Older than allowed: ${sentence}`;
  if (type === "incomplete" || type === "needs_review") return `Could not confirm that ${lower}`;
  if (type === "conflict") return `Sources disagree: ${lower}`;
  return sentence;
}

/** Status sentences an operator can act on, rather than an enum. The row's own open check says more. */
export const STATUS_MEANING: Record<string, string> = {
  satisfied: "Evidence on file meets every check.",
  received_with_issues: "Evidence is on file, but a check is not met.",
  missing: "No accepted evidence is on file.",
  needs_review: "Evidence or a record is on file, but a check is not confirmed yet.",
  not_applicable: "This deal's profile excludes this requirement.",
  waived: "Waived with a recorded reason.",
  tracking: "Lender-ordered work, tracked by hand.",
};

/** Words for stored values shown in pills. The stored value stays in the tooltip. */
export const VALUE_LABEL: Record<string, string> = {
  tracking: "Lender tracking",
  requested: "Follow-up sent",
  stale: "Out of date",
  conflict: "Sources disagree",
  info: "For information",
  blocker: "Top priority",
  major: "High priority",
  minor: "Normal priority",
};

/** Money, dates and percentages read from the attribute's own unit rather than being guessed. */
export function factValue(attribute: string, unit: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    if ("last_four" in (value as object))
      return `••••${(value as { last_four: string }).last_four}`;
    if (Array.isArray(value))
      return value
        .map((item) =>
          item && typeof item === "object"
            ? Object.entries(item as Record<string, unknown>)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([, v]) => factValue(attribute, "text", v))
                .join(" / ")
            : factValue(attribute, "text", item),
        )
        .join("; ");
    return Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => !k.endsWith("_id") && v !== null && v !== undefined)
      .map(([k, v]) => `${k.replaceAll("_", " ")} ${factValue(attribute, "text", v)}`)
      .join(" · ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (unit === "USD")
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });
    if (unit === "percent") return `${value}%`;
    if (unit === "months") return `${value} month${value === 1 ? "" : "s"}`;
    return value.toLocaleString("en-US");
  }
  if (unit === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf()))
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
  }
  return String(value);
}

/** The attribute an operator reads, not the dotted path. */
export function attributeName(attribute: string): string {
  const [group, field = ""] = attribute.split(".");
  const name = field.replaceAll("_", " ");
  const prefix: Record<string, string> = {
    party: "Party",
    deal: "Transaction",
    pfs: "Personal financial statement",
    tax: "Tax return",
    financial: "Financial statement",
    funding: "Sources and uses",
    bank: "Bank statement",
    note: "Seller note",
    lease: "Lease",
    gift: "Gift",
    aging: "Aging",
    debt: "Debt schedule",
    ownership: "Ownership",
    agent: "Paid agent",
    id: "Identification",
    irs: "IRS request",
    report: "Report",
    citizenship: "Citizenship",
    consulting: "Consulting agreement",
  };
  return `${prefix[group ?? ""] ?? group ?? ""} · ${name.replace(/^./, (c) => c.toUpperCase())}`;
}

/** Where a finding detail came from, when it is not a document page. */
export const sourceLabel = (file: string, page: number | null, resolved: string) =>
  page === null
    ? file === "Declared deal profile"
      ? "Deal profile"
      : file
    : `${resolved}, page ${page}`;

/** Neutral subject: a rule's positive condition must not read as a passed finding. */
export function reviewSubject(title: string) {
  return title
    .replace(/:\s*for lender review$/i, "")
    .replace(/\s+agrees?\b.*$/i, "")
    .replace(/\s+equals?\b.*$/i, " comparison");
}

/**
 * The party an operator addresses. `requests.responsible` is a stored key, and `buildDrafts`
 * composes it as either a role or "role · party", so this renames for display only and leaves the
 * key that identifies a recorded request untouched.
 */
export function responsibleName(responsible: string): string {
  const ROLES: Record<string, string> = {
    buyer: "Buyer",
    seller: "Seller",
    broker: "Broker",
    lender: "Lender",
    adviser: "Adviser",
    "buyer attorney": "Buyer's attorney",
    "seller attorney": "Seller's attorney",
    accountant: "Accountant",
  };
  const name = (part: string) => {
    const key = part.trim().toLowerCase();
    return ROLES[key] ?? part.trim().replace(/^./, (c) => c.toUpperCase());
  };
  const [role, ...rest] = responsible.split("·");
  // A composite keeps its party, which is already a proper name and is not re-cased.
  return rest.length ? `${name(role ?? "")} · ${rest.join("·").trim()}` : name(responsible);
}

/**
 * Why a source file is waiting on a person. Intake review types name the stage that stopped, which
 * an operator does not share; each one says what is actually needed instead.
 */
export const attentionKind = (type: string): string =>
  ({
    unreadable: "Could not be read",
    extraction_gap: "Values not found",
    party_assignment: "Party unclear",
    segmentation: "Filing unclear",
    version_conflict: "Replaces an earlier file",
    duplicate: "Possible duplicate",
  })[type] ?? type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
