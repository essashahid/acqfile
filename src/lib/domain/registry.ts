import { z } from "zod";

export const EXTRACTED_TYPES = ["SBA_1919", "SBA_413", "TAX_PERSONAL", "TAX_BUSINESS", "FIN_YEAR_END", "FIN_INTERIM", "AGING_AR", "AGING_AP", "DEBT_SCHEDULE", "LOI", "PURCHASE_AGREEMENT", "SOURCES_USES", "SELLER_NOTE", "BANK_STATEMENT", "GIFT_LETTER", "LEASE", "OPERATING_AGREEMENT", "EIN_LETTER", "GOV_ID", "CITIZENSHIP_EVIDENCE", "IRS_4506C", "SBA_159", "CONSULTING_AGREEMENT", "VALUATION", "QOE"] as const;
export const CLASSIFICATION_TYPES = ["RESUME", "CREDIT_AUTH", "FORMATION_DOC", "GOOD_STANDING", "OWNERSHIP_CHART", "BUSINESS_PLAN", "PROJECTIONS", "ADDBACK_SCHEDULE", "EQUIPMENT_LIST", "LICENSE", "FRANCHISE_AGREEMENT", "CIM", "ESCROW_EVIDENCE", "NON_COMPETE", "RE_CONTRACT", "OTHER_NOT_REQUIRED", "UNREADABLE", "SBA_155", "TRANSFER_EVIDENCE", "FRANCHISE_DISCLOSURE", "LEASE_CONSENT", "INVENTORY_SUMMARY", "KEY_CONTRACT", "EMPLOYEE_ROSTER", "TAX_EXTENSION", "APPRAISAL", "ENVIRONMENTAL"] as const;
export const DOCUMENT_TYPES = [...EXTRACTED_TYPES, ...CLASSIFICATION_TYPES] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
const TaxonomyEntry = z.strictObject({ id: DocumentTypeSchema, extraction: z.boolean(), label: z.string().min(1) });
export const TAXONOMY = z.array(TaxonomyEntry).parse(DOCUMENT_TYPES.map(id => ({ id, extraction: (EXTRACTED_TYPES as readonly string[]).includes(id), label: id.replaceAll("_", " ") })));

const FactDefinition = z.strictObject({
  attribute: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  value_type: z.enum(["text", "money", "number", "date", "boolean", "identifier", "owners", "amounts", "debts", "strings"]),
  unit: z.enum(["text", "USD", "count", "months", "percent", "date", "boolean", "masked_identifier", "table"]),
  subject_kind: z.enum(["deal", "party", "account"]),
  period_kind: z.enum(["none", "tax_year", "financial_period", "as_of"]),
  producers: z.array(DocumentTypeSchema).min(1),
});
export type FactDefinition = z.infer<typeof FactDefinition>;
// This is a registry, not an extraction prompt. Classification-only producers allow
// evidenced manual facts; no new extractor is introduced by Phase 1.
const definitions: FactDefinition[] = [];
function register(attribute: string, value_type: FactDefinition["value_type"], producers: DocumentType[], period_kind: FactDefinition["period_kind"] = "none", subject_kind: FactDefinition["subject_kind"] = "party", unit?: FactDefinition["unit"]) {
  definitions.push({ attribute, value_type, producers, period_kind, subject_kind, unit: unit ?? ({ money: "USD", number: "count", date: "date", boolean: "boolean", identifier: "masked_identifier", owners: "table", amounts: "table", debts: "table", strings: "table", text: "text" } as const)[value_type] });
}
const names: DocumentType[] = ["SBA_1919", "SBA_413", "TAX_PERSONAL", "TAX_BUSINESS", "FIN_YEAR_END", "FIN_INTERIM", "LOI", "PURCHASE_AGREEMENT", "BANK_STATEMENT", "LEASE", "OPERATING_AGREEMENT", "EIN_LETTER", "GOV_ID", "CITIZENSHIP_EVIDENCE", "IRS_4506C", "VALUATION", "QOE"];
register("party.legal_name", "text", names);
register("party.identifier", "identifier", ["SBA_1919", "TAX_PERSONAL", "TAX_BUSINESS", "PURCHASE_AGREEMENT", "EIN_LETTER", "IRS_4506C"]);
register("party.address", "text", ["SBA_1919", "TAX_BUSINESS", "PURCHASE_AGREEMENT", "LEASE"]);
register("party.dba", "text", ["SBA_1919"]);
register("party.entity_type", "text", ["SBA_1919"]);
register("ownership.members", "owners", ["SBA_1919", "OPERATING_AGREEMENT", "OWNERSHIP_CHART"]);
for (const a of ["purchase_price", "seller_note_amount"]) register(`deal.${a}`, "money", ["LOI", "PURCHASE_AGREEMENT", "SOURCES_USES"], "none", "deal");
register("deal.loan_requested", "money", ["SBA_1919"], "none", "deal");
register("deal.structure", "text", ["LOI", "PURCHASE_AGREEMENT"], "none", "deal");
register("deal.buyer", "text", ["LOI", "PURCHASE_AGREEMENT"], "none", "deal");
register("deal.seller", "text", ["LOI", "PURCHASE_AGREEMENT"], "none", "deal");
register("deal.seller_note_terms", "text", ["LOI", "PURCHASE_AGREEMENT", "SELLER_NOTE", "SOURCES_USES"], "none", "deal");
register("deal.expiry_date", "date", ["LOI"], "none", "deal");
register("deal.outside_date", "date", ["PURCHASE_AGREEMENT"], "none", "deal");
register("deal.allocation_present", "boolean", ["PURCHASE_AGREEMENT"], "none", "deal");
register("deal.signed_by_both", "boolean", ["LOI"], "none", "deal");
register("deal.executed", "boolean", ["PURCHASE_AGREEMENT"], "none", "deal");
for (const a of ["sources", "uses"]) { register(`funding.${a}`, "amounts", ["SOURCES_USES"], "none", "deal"); register(`funding.${a}_total`, "money", ["SOURCES_USES"], "none", "deal"); }
for (const a of ["cash", "total_assets", "total_liabilities", "net_worth"]) register(`pfs.${a}`, "money", ["SBA_413"], "as_of");
register("pfs.as_of_date", "date", ["SBA_413"], "as_of");
register("pfs.spouse_signed", "boolean", ["SBA_413"], "as_of");
register("tax.year", "number", ["TAX_PERSONAL", "TAX_BUSINESS"], "tax_year");
register("tax.page_count", "number", ["TAX_PERSONAL", "TAX_BUSINESS"], "tax_year");
register("tax.form_type", "text", ["TAX_BUSINESS"], "tax_year");
for (const a of ["gross_receipts", "net_income", "officer_compensation", "depreciation", "interest_expense"]) register(`tax.${a}`, "money", ["TAX_BUSINESS"], "tax_year");
for (const a of ["revenue", "net_income", "total_assets", "total_liabilities"]) register(`financial.${a}`, "money", ["FIN_YEAR_END", "FIN_INTERIM"], "financial_period");
for (const a of ["period_start", "period_end"]) register(`financial.${a}`, "date", ["FIN_YEAR_END", "FIN_INTERIM"], "financial_period");
register("aging.as_of_date", "date", ["AGING_AR", "AGING_AP"], "as_of");
register("aging.total", "money", ["AGING_AR", "AGING_AP"], "as_of");
register("debt.as_of_date", "date", ["DEBT_SCHEDULE"], "as_of");
register("debt.total", "money", ["DEBT_SCHEDULE"], "as_of");
register("debt.debts", "debts", ["DEBT_SCHEDULE"], "as_of");
register("note.principal", "money", ["SELLER_NOTE"]);
register("note.rate", "number", ["SELLER_NOTE"], "none", "party", "percent");
register("note.term_months", "number", ["SELLER_NOTE"], "none", "party", "months");
register("note.full_standby", "boolean", ["SELLER_NOTE"]);
register("bank.account", "identifier", ["BANK_STATEMENT"], "as_of", "account");
register("bank.institution", "text", ["BANK_STATEMENT"], "as_of", "account");
register("bank.period_end", "date", ["BANK_STATEMENT"], "as_of", "account");
register("bank.ending_balance", "money", ["BANK_STATEMENT"], "as_of", "account");
for (const a of ["donor", "recipient"]) register(`gift.${a}`, "text", ["GIFT_LETTER"]);
register("gift.amount", "money", ["GIFT_LETTER"]);
register("gift.no_repayment", "boolean", ["GIFT_LETTER"]);
for (const a of ["landlord", "tenant"]) register(`lease.${a}`, "text", ["LEASE"]);
for (const a of ["commencement", "expiry"]) register(`lease.${a}`, "date", ["LEASE"]);
register("lease.option_years", "number", ["LEASE"]);
register("lease.assignment_present", "boolean", ["LEASE"]);
register("id.expiry", "date", ["GOV_ID"]);
register("citizenship.evidence_kind", "text", ["CITIZENSHIP_EVIDENCE"]);
register("irs.years_requested", "strings", ["IRS_4506C"]);
for (const a of ["agent", "services", "payer"]) register(`agent.${a}`, "text", ["SBA_159"]);
register("agent.amount", "money", ["SBA_159"]);
register("agent.both_signed", "boolean", ["SBA_159"]);
register("consulting.party", "text", ["CONSULTING_AGREEMENT"]);
register("consulting.term_months", "number", ["CONSULTING_AGREEMENT"], "none", "party", "months");
for (const a of ["preparer", "credential"]) register(`report.${a}`, "text", ["VALUATION", "QOE"]);
register("report.date", "date", ["VALUATION", "QOE"]);
register("report.concluded_value", "money", ["VALUATION"]);
// Shared signatures/revisions are metadata (A10), not model-only facts.
export const FACT_CATALOG = z.array(FactDefinition).parse(definitions);
if (new Set(FACT_CATALOG.map(f => f.attribute)).size !== FACT_CATALOG.length || new Set(TAXONOMY.map(t => t.id)).size !== TAXONOMY.length) throw new Error("Duplicate registry id");
export const FACTS = Object.fromEntries(FACT_CATALOG.map(f => [f.attribute, f]));
export const FactAttributeSchema = z.string().refine(a => Object.hasOwn(FACTS, a), "Unknown fact attribute");
