/**
 * What each synthetic document states, in the words a real one would use. Drawing, truth locators
 * and planted-fault quotes all read these functions, so a quote can never drift from the page.
 * Pure: no rendering, parser or engine imports.
 */
import type { Doc, Plan } from "../../plans/shared";
import { display } from "./display";
import { amount, dollarsInWords, longDate, money, money2, usDate } from "./format";

/** A fact is stated as a label and value on one row, or inside a sentence the page prints whole. */
export type Stated = { label: string; value: string } | { sentence: string } | { value: string };
export const statedText = (s: Stated) =>
  "sentence" in s ? s.sentence : "label" in s ? `${s.label} ${s.value}` : s.value;

type Row = { label: string; amount: number };
type Member = { name: string; percent: number; title?: string };
const rows = (v: unknown) => v as Row[];
const periodEnd = (d: Doc) =>
  String(d.facts["bank.period_end"] ?? d.metadata.document_date ?? "2026-08-31");
const firstOfMonth = (iso: string) => `${iso.slice(0, 8)}01`;
const firstOfYear = (iso: string) => `${iso.slice(0, 4)}-01-01`;
export const street = (address: string) => address.split(", ")[0]!;
export const cityLine = (address: string) => address.split(", ").slice(1).join(", ");
export const memberRow = (m: Member) => `${m.name} ${m.percent}%${m.title ? ` ${m.title}` : ""}`;
export const fundingRow = (r: Row) => `${r.label} ${money(r.amount)}`;

export function stated(d: Doc, attribute: string, value: unknown): Stated {
  const v = value;
  const s = (sentence: string): Stated => ({ sentence });
  const l = (label: string, text: string): Stated => ({ label, value: text });
  switch (d.type) {
    case "LOI":
      switch (attribute) {
        case "deal.purchase_price":
          return s(`The total purchase price will be ${money(v as number)}`);
        case "deal.seller_note_amount":
          return s(
            `a promissory note from Buyer to Seller in the principal amount of ${money(v as number)}`,
          );
        case "deal.seller_note_terms":
          return s(`The Seller Note will be repaid on the following terms: ${String(v)}`);
        case "deal.expiry_date":
          return s(`This letter will expire if not accepted in writing by ${longDate(v)}`);
        case "deal.signed_by_both":
          return s(
            v
              ? "Agreed and accepted by Buyer and Seller as of the date first written above"
              : "Seller has not countersigned this letter",
          );
      }
      break;
    case "PURCHASE_AGREEMENT":
      switch (attribute) {
        case "deal.buyer":
          return s(`by and between ${String(v)} (“Buyer”)`);
        case "deal.seller":
          return s(`and ${String(v)} (“Seller”)`);
        case "deal.purchase_price":
          return s(`The aggregate purchase price is ${money(v as number)} (the “Purchase Price”)`);
        case "deal.structure":
          return s(
            v === "stock"
              ? "Seller shall sell and transfer to Buyer all of the issued and outstanding equity interests of the Company (a stock purchase)"
              : "Seller shall sell, assign and transfer to Buyer substantially all of the assets used in the Business (an asset purchase)",
          );
        case "deal.allocation_present":
          return s(
            v
              ? "The Purchase Price shall be allocated among the Purchased Assets as set forth on Schedule 2.4"
              : "The parties have not agreed an allocation of the Purchase Price",
          );
        case "deal.outside_date":
          return s(`if the Closing has not occurred on or before ${longDate(v)}`);
        case "party.legal_name":
          return s(`SELLER: ${String(v)}`);
        case "party.identifier":
          return s(`Seller’s federal employer identification number is ${display(v)}`);
        case "deal.seller_note_amount":
          return s(`the Seller Note in the original principal amount of ${money(v as number)}`);
        case "deal.seller_note_terms":
          return s(`The Seller Note shall be repaid on the following terms: ${String(v)}`);
        case "party.address":
          return s(`Seller’s principal place of business is ${String(v)}`);
      }
      break;
    case "SOURCES_USES":
      switch (attribute) {
        case "funding.sources":
        case "funding.uses":
          return { value: rows(v).map(fundingRow).join(" ") };
        case "funding.sources_total":
          return l("Total sources", money(v as number));
        case "funding.uses_total":
          return l("Total uses", money(v as number));
        case "deal.purchase_price":
          return l("Purchase price", money(v as number));
        case "deal.seller_note_amount":
          return l("Seller note amount", money(v as number));
        case "deal.seller_note_terms":
          return l("Seller note terms", String(v));
      }
      break;
    case "BANK_STATEMENT":
      switch (attribute) {
        case "party.legal_name":
          return l("Account owner", String(v));
        case "bank.institution":
          return { value: String(v) };
        case "bank.ending_balance":
          return l(`Ending balance on ${longDate(periodEnd(d))}`, money2(v as number));
        case "bank.period_end":
          return s(`Statement period: ${longDate(firstOfMonth(String(v)))} through ${longDate(v)}`);
      }
      break;
    case "FIN_YEAR_END":
    case "FIN_INTERIM":
      switch (attribute) {
        case "financial.revenue":
          return l("Total revenue", money(v as number));
        case "financial.net_income":
          return l("Net income", money(v as number));
        case "financial.total_assets":
          return l("Total assets", money(v as number));
        case "financial.total_liabilities":
          return l("Total liabilities", money(v as number));
        case "financial.period_end":
          return s(`For the period from ${longDate(firstOfYear(String(v)))} to ${longDate(v)}`);
      }
      break;
    case "AGING_AR":
    case "AGING_AP":
      if (attribute === "aging.as_of_date") return s(`Aged as of ${longDate(v)}`);
      break;
    case "DEBT_SCHEDULE":
      if (attribute === "debt.as_of_date") return s(`Balances as of ${longDate(v)}`);
      if (attribute === "debt.total") return l("Total present balance", money2(v as number));
      break;
    case "EIN_LETTER":
      if (attribute === "party.identifier") return s(`We assigned you EIN ${display(v)}`);
      break;
    case "GOV_ID":
      if (attribute === "id.expiry") return l("4b EXP", usDate(v));
      break;
    case "SELLER_NOTE":
      switch (attribute) {
        case "note.principal":
          return s(`the principal sum of ${dollarsInWords(v as number)} (${money2(v as number)})`);
        case "note.term_months":
          return s(
            `The entire unpaid principal balance of this Note shall be due and payable ${String(v)} months after the Closing Date`,
          );
        case "note.full_standby":
          return s(
            v
              ? "No payment of principal or interest shall be made on this Note for the life of the SBA loan"
              : "Payments may be made on this Note after the standby period described in Section 3",
          );
        case "deal.seller_note_terms":
          return s(`Repayment terms: ${String(v)}`);
      }
      break;
    case "LEASE":
      switch (attribute) {
        case "party.address":
          return l("Premises", String(v));
        case "lease.tenant":
          return l("Tenant", String(v));
        case "lease.landlord":
          return l("Landlord", String(v));
        case "lease.expiry":
          return l("Expiration Date", longDate(v));
        case "lease.option_years":
          return l("Renewal option term (years)", String(v));
        case "lease.assignment_present":
          return s(
            v
              ? "Landlord consents to the assignment of this Lease to the purchaser of Tenant’s business, effective on the closing of that sale"
              : "This Lease has not been assigned, and Tenant may not assign it without Landlord’s prior written consent",
          );
      }
      break;
    case "CONSULTING_AGREEMENT":
      if (attribute === "consulting.party") return s(`engages ${String(v)} (“Consultant”)`);
      if (attribute === "consulting.term_months")
        return s(`for a term of ${String(v)} months commencing on the Closing Date`);
      break;
    case "GIFT_LETTER":
      switch (attribute) {
        case "gift.amount":
          return s(`a gift of ${money(v as number)}`);
        case "gift.no_repayment":
          return s(
            v
              ? "No repayment of this gift is expected or implied, in cash or in services"
              : "The donor expects this amount to be repaid",
          );
        case "gift.donor":
          return l("Donor name", String(v));
        case "gift.recipient":
          return l("Recipient name", String(v));
      }
      break;
    case "OPERATING_AGREEMENT":
    case "OWNERSHIP_CHART":
      if (attribute === "ownership.members")
        return { value: (v as Member[]).map(memberRow).join(" ") };
      break;
    // Official IRS pages: the form prints the label, so the evidence is the entered value or the
    // form's own line, exactly as tax software fills a return.
    case "TAX_PERSONAL":
      // Tax software prints the form and year on every client copy; not every revision's own
      // text layer carries its "For the year" line (2022 does not), so cite the client copy.
      if (attribute === "tax.year") return s(`Form 1040 (${String(v)})`);
      if (attribute === "party.identifier") return { value: display(v) };
      break;
    case "TAX_BUSINESS":
      switch (attribute) {
        case "tax.year":
          return s(`For calendar year ${String(v)}`);
        case "tax.form_type":
          return s(`Form ${String(v)}`);
        case "party.address": {
          // From the 2025 revision the form splits city, state and ZIP into separate boxes.
          const [city, rest = ""] = cityLine(String(v)).split(", ");
          return {
            value:
              Number(d.period) >= 2025
                ? `${street(String(v))} ${city} ${rest}`
                : `${street(String(v))} ${cityLine(String(v))}`,
          };
        }
        case "tax.gross_receipts":
        case "tax.net_income":
          return { value: amount(v as number) };
        case "party.legal_name":
        case "party.identifier":
          return { value: display(v) };
      }
      break;
    case "IRS_4506C":
      if (attribute === "party.legal_name" || attribute === "party.identifier")
        return { value: display(v) };
      break;
  }
  throw Error(`No stated wording for ${d.type}/${attribute}`);
}
/** The evidence quote a reader would cite for this value on this document. */
export const factQuote = (d: Doc, attribute: string, value: unknown = d.facts[attribute]) =>
  statedText(stated(d, attribute, value));

/** Title a real document of this type carries; the intake classifier recognises each one. */
export const CUE: Partial<Record<Doc["type"], string>> = {
  SBA_1919: "SBA Form 1919 (02/2025) - Borrower Information Form | OMB 3245-0348",
  SBA_413: "SBA Form 413 - Personal Financial Statement | OMB 3245-0188",
  TAX_PERSONAL: "U.S. Individual Income Tax Return",
  TAX_BUSINESS: "U.S. Income Tax Return for an S Corporation",
  TAX_EXTENSION: "Form 4868",
  IRS_4506C: "IVES Request for Transcript of Tax Return",
  FIN_YEAR_END: "Year-end Income Statement and Balance Sheet",
  FIN_INTERIM: "Interim Income Statement and Balance Sheet",
  BANK_STATEMENT: "Monthly Account Statement",
  GOV_ID: "IDENTIFICATION CARD",
  LOI: "Letter of Intent",
  SOURCES_USES: "Sources and Uses of Funds",
  LEASE: "Commercial Premises Lease",
  LEASE_CONSENT: "Consent to Assignment of Lease",
  CREDIT_AUTH: "Authorization to Obtain Credit Report",
  FORMATION_DOC: "Articles of Organization",
  GIFT_LETTER: "Gift Letter",
  ADDBACK_SCHEDULE: "Schedule of Add-backs",
  AGING_AR: "Accounts Receivable Aging",
  AGING_AP: "Accounts Payable Aging",
  DEBT_SCHEDULE: "Business Debt Schedule",
  OPERATING_AGREEMENT: "Operating Agreement",
  EIN_LETTER: "WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER",
  GOOD_STANDING: "Certificate of Good Standing",
  OWNERSHIP_CHART: "Ownership Chart",
  BUSINESS_PLAN: "Business Plan",
  PROJECTIONS: "Financial Projections",
  RESUME: "RESUME",
  CITIZENSHIP_EVIDENCE: "Certificate of Live Birth",
  EQUIPMENT_LIST: "Equipment List",
  INVENTORY_SUMMARY: "Inventory Summary",
  LICENSE: "Business License",
  NON_COMPETE: "Non-Competition Agreement",
  FRANCHISE_AGREEMENT: "Franchise Agreement",
  FRANCHISE_DISCLOSURE: "FRANCHISE DISCLOSURE DOCUMENT",
  TRANSFER_EVIDENCE: "Wire Transfer Confirmation",
  CONSULTING_AGREEMENT: "Consulting Agreement",
  SELLER_NOTE: "Promissory Note (Seller Note)",
};
export const cue = (d: Doc) =>
  // Material that is not required has no type title; it reads as what it is.
  d.type === "OTHER_NOT_REQUIRED"
    ? d.notes.some((n) => n.startsWith("Named party:"))
      ? "Letter of Reference"
      : "Customer care guide"
    : d.type === "PURCHASE_AGREEMENT"
      ? `${d.facts["deal.structure"] === "stock" ? "Stock" : "Asset"} Purchase Agreement`
      : (CUE[d.type] ??
        d.type
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()));

export const partyName = (p: Plan, d: Doc) =>
  p.parties.find((x) => x.id === d.party)?.legal_name ?? "Unmatched named party";
/** Index lines the intake reads for party, period, date and account; each prints on its own line. */
export function metaLines(p: Plan, d: Doc) {
  return [
    `Name: ${partyName(p, d)}`,
    ...(d.period ? [`Period: ${d.period}`] : []),
    ...(d.metadata.document_date ? [`Document date: ${usDate(d.metadata.document_date)}`] : []),
    ...(d.metadata.account_last_four ? [`Account ending: ${d.metadata.account_last_four}`] : []),
  ];
}
const BLANK = "________________";
/** The signature record an e-signed or wet-signed copy carries; unsigned forms keep blank rules. */
export const signatureLine = (d: Doc) =>
  `Signature: ${d.metadata.signed ? "e-signed" : BLANK}; Date: ${
    d.metadata.dated && d.metadata.signature_date ? usDate(d.metadata.signature_date) : BLANK
  }`;
