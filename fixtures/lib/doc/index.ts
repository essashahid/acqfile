/** Entry point for drawing a synthetic document and for the text it must contain. */
import { createHash } from "node:crypto";
import type { Doc, Plan } from "../../plans/shared";
import { officialForm } from "../../../src/lib/config/official-form-fields";
import * as agreements from "./agreements";
import * as certificates from "./certificates";
import { IRS_TYPES } from "./irs";
import { context, type Ctx } from "./kit";
import { cue, factQuote, metaLines, signatureLine } from "./quotes";
import { Sheet, loadMetrics, type Op } from "./sheet";
import * as statements from "./statements";

type Template = (c: Ctx) => void;
const TEMPLATES: Partial<Record<Doc["type"], Template>> = {
  LOI: agreements.loi,
  PURCHASE_AGREEMENT: agreements.purchaseAgreement,
  LEASE: agreements.lease,
  LEASE_CONSENT: agreements.leaseConsent,
  OPERATING_AGREEMENT: agreements.operatingAgreement,
  SELLER_NOTE: agreements.sellerNote,
  CONSULTING_AGREEMENT: agreements.consulting,
  NON_COMPETE: agreements.nonCompete,
  FRANCHISE_AGREEMENT: agreements.franchiseAgreement,
  GIFT_LETTER: agreements.giftLetter,
  CREDIT_AUTH: agreements.creditAuth,
  BANK_STATEMENT: statements.bankStatement,
  FIN_YEAR_END: statements.financials,
  FIN_INTERIM: statements.financials,
  AGING_AR: statements.aging,
  AGING_AP: statements.aging,
  DEBT_SCHEDULE: statements.debtSchedule,
  SOURCES_USES: statements.sourcesUses,
  ADDBACK_SCHEDULE: statements.addbacks,
  PROJECTIONS: statements.projections,
  EQUIPMENT_LIST: statements.equipmentList,
  INVENTORY_SUMMARY: statements.inventorySummary,
  OWNERSHIP_CHART: statements.ownershipChart,
  TRANSFER_EVIDENCE: statements.wireConfirmation,
  EIN_LETTER: certificates.einLetter,
  GOOD_STANDING: certificates.goodStanding,
  LICENSE: certificates.businessLicense,
  FORMATION_DOC: certificates.articles,
  GOV_ID: certificates.stateId,
  CITIZENSHIP_EVIDENCE: certificates.birthCertificate,
  RESUME: certificates.resume,
  FRANCHISE_DISCLOSURE: certificates.fddCover,
  OTHER_NOT_REQUIRED: (c) =>
    c.d.notes.some((n) => n.startsWith("Named party:"))
      ? certificates.referenceLetter(c)
      : certificates.brochure(c),
};

export type PageOptions = { pageLabel?: string };
/** Drawing operations for one ordinary (non-IRS, non-official) document page. */
export async function templateOps(p: Plan, d: Doc, o: PageOptions = {}): Promise<Op[]> {
  const s = new Sheet(await loadMetrics());
  const c = context(s, p, d);
  (TEMPLATES[d.type] ?? ((ctx: Ctx) => certificates.generic(ctx, cue(d))))(c);
  const ops = o.pageLabel
    ? s.ops.map((op) =>
        op.k === "text" ? { ...op, s: op.s.replace("Page 1 of 1", o.pageLabel!) } : op,
      )
    : s.ops;
  // Fail at authoring time if a stated value is not on the page exactly as truth will cite it.
  const text = ops.flatMap((op) => (op.k === "text" ? [op.s] : [])).join(" ");
  const flat = text.replace(/\s+/g, " ");
  for (const attribute of Object.keys(d.facts)) {
    const quote = factQuote(d, attribute).replace(/\s+/g, " ");
    if (!flat.includes(quote))
      throw Error(`${d.id} (${d.type}): ${attribute} not drawn as “${quote}”`);
  }
  return ops;
}

export const isIrs = (d: Doc) => IRS_TYPES.has(d.type);
export const isOfficial = (d: Doc) => !!officialForm(d.type);
/**
 * Strings the extracted text of a document must contain: its index lines, signature record,
 * every stated fact and every authored note. Official SBA pages are checked through their fields.
 */
export function required(p: Plan, d: Doc): string[] {
  if (isOfficial(d)) return [];
  const quotes = d.format === "xlsx" ? [] : Object.keys(d.facts).map((a) => factQuote(d, a));
  // The title is checked separately and case-insensitively: agreements print it in capitals.
  return [...metaLines(p, d), signatureLine(d), ...quotes, ...d.notes, "SYNTHETIC"];
}
export { cue, factQuote, metaLines, signatureLine };

/**
 * A document's identity, written into its file metadata as real documents carry an ID. The mock
 * reads answers by file hash, so two documents with different authored content must never be
 * byte-identical, even when a value they differ in prints the same as a template default.
 */
export const fingerprint = (docs: Doc[]) =>
  `synthetic-document ${createHash("sha256")
    .update(
      JSON.stringify(
        docs.map(({ id, type, party, period, facts, metadata, notes }) => ({
          id,
          type,
          party,
          period,
          facts,
          metadata,
          notes,
        })),
      ),
    )
    .digest("hex")
    .slice(0, 24)}`;
