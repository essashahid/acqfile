/** Customer wording lives here, separate from staff diagnostics. */
export const labels: Record<string, string> = {
  CIM: "Business information",
  ESCROW_EVIDENCE: "Deposit evidence",
  RE_CONTRACT: "Property contract",
  SBA_1919: "Borrower information",
  SBA_413: "Personal financial statement",
  TAX_PERSONAL: "Personal tax return",
  TAX_BUSINESS: "Business tax return",
  FIN_YEAR_END: "Year-end financial statements",
  FIN_INTERIM: "Current business financial statements",
  AGING_AR: "Money owed to the business",
  AGING_AP: "Money the business owes",
  DEBT_SCHEDULE: "Business debts",
  LOI: "Letter of intent",
  PURCHASE_AGREEMENT: "Purchase agreement",
  SOURCES_USES: "Funding plan",
  SELLER_NOTE: "Seller loan agreement",
  BANK_STATEMENT: "Bank statements",
  GIFT_LETTER: "Gift letter",
  LEASE: "Business lease",
  OPERATING_AGREEMENT: "Ownership agreement",
  EIN_LETTER: "Business tax registration",
  GOV_ID: "Photo identification",
  CITIZENSHIP_EVIDENCE: "Citizenship evidence",
  IRS_4506C: "Tax transcript consent",
  SBA_159: "Agent compensation disclosure",
  CONSULTING_AGREEMENT: "Consulting agreement",
  VALUATION: "Business valuation",
  QOE: "Earnings report",
  RESUME: "Résumé",
  CREDIT_AUTH: "Credit consent",
  FORMATION_DOC: "Business formation documents",
  GOOD_STANDING: "Good standing certificate",
  OWNERSHIP_CHART: "Business ownership",
  BUSINESS_PLAN: "Business plan",
  PROJECTIONS: "Business forecast",
  ADDBACK_SCHEDULE: "Adjusted earnings schedule",
  EQUIPMENT_LIST: "Equipment list",
  LICENSE: "Business licence",
  NON_COMPETE: "Non-compete agreement",
  SBA_155: "Standby agreement",
  TRANSFER_EVIDENCE: "Money transfer evidence",
  FRANCHISE_DISCLOSURE: "Franchise disclosure",
  FRANCHISE_AGREEMENT: "Franchise agreement",
  LEASE_CONSENT: "Landlord consent",
  INVENTORY_SUMMARY: "Inventory summary",
  KEY_CONTRACT: "Business contract",
  EMPLOYEE_ROSTER: "Employee list",
  TAX_EXTENSION: "Tax filing extension",
  APPRAISAL: "Property appraisal",
  ENVIRONMENTAL: "Environmental report",
  OTHER_NOT_REQUIRED: "Additional document",
  UNREADABLE: "Document to open",
  INSURANCE: "Insurance evidence",
  AFFILIATE_LIST: "Related businesses",
};
export const labelFor = (type: string) => labels[type] ?? "Supporting document";
export const dateLabel = (date: string | Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(date),
      )
    : "";
export const numberWord = (n: number) =>
  ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ??
  String(n);
export const customerBanned =
  /\b(error|invalid|failed|rejected|flags?|exceptions?|conflicts?|mismatch|stale|requests?|packages?|findings?|needs_review|received_with_issues|segments?|attestations?|evaluations?|overlays?|snapshots?|hash(?:es)?|sha(?:256)?|acroform|vision|idempot\w*|confidence|mock|approved|pre-approved|eligible|ineligible|qualifies|compliant)\b|meets SBA requirements|checklist item|accepted by the lender|on track|\b(?:CON|GUA|TGT|ENT|TXN)-\d|\b\d{2}:\d{2}:\d{2}\b/i;
export const instructions = (type: string) => {
  if (type === "TAX_PERSONAL")
    return {
      why: "The lender asks for the last three years of tax returns for each owner of the business.",
      what: "Please send every page of your federal return (Form 1040), including the schedules. A PDF from your accountant is best.",
    };
  if (type === "BANK_STATEMENT")
    return {
      why: "The lender wants to see where your share of the down payment is coming from.",
      what: "Please send every numbered page of each monthly statement for the account the money will come from.",
    };
  if (type === "SBA_413")
    return {
      why: "This helps the lender understand your personal finances.",
      what: "Please send a current personal financial statement (Form 413), signed and dated.",
    };
  if (type === "SBA_1919")
    return {
      why: "This gives the lender the borrower information needed to prepare the loan file.",
      what: "Please complete the borrower information form (Form 1919), then sign and date it.",
    };
  if (type === "CITIZENSHIP_EVIDENCE")
    return {
      why: "The lender needs evidence of citizenship for the people involved in the business.",
      what: "Please send a passport, birth certificate or naturalization certificate.",
    };
  return {
    why: "This helps the team prepare a complete loan file for the lender.",
    what: "Please send a complete, readable copy, including every numbered page.",
  };
};

export function periodLabel(period: string) {
  return /^\d{4}-\d{2}$/.test(period)
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(period + "-01"),
      )
    : period;
}
