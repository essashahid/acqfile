import { z } from "zod";
export const DateOnly = z.iso.date();
export const Unknown = z.literal("unknown");
const knownOrUnknown = <T extends z.ZodType>(schema: T) => z.union([schema, Unknown]);
const text = knownOrUnknown(z.string().min(1));
const amount = knownOrUnknown(z.number().nonnegative().finite());
const yesNo = z.enum(["yes", "no", "unknown"]);
export const IdentifierSchema = z.strictObject({ hmac: z.string().regex(/^[a-f0-9]{64}$/), last_four: z.string().regex(/^\d{4}$/) });
export const PARTY_ROLES = ["buyer_owner", "guarantor", "buyer_entity", "seller_entity", "seller_owner", "affiliate", "donor", "investor", "landlord", "cpa", "attorney", "broker", "lender_contact", "unknown"] as const;
export const PartySchema = z.strictObject({ id: z.string().min(1), kind: z.enum(["individual", "entity", "unknown"]), roles: z.array(z.enum(PARTY_ROLES)).min(1), legal_name: text, name_variants: z.array(z.string()).default([]), identifier: IdentifierSchema.nullable().default(null), jointly_held_assets: yesNo.default("unknown"), affiliates: knownOrUnknown(z.array(z.string())).default("unknown") });
export const OwnershipSchema = z.strictObject({ owner_party_id: z.string().min(1), owned_party_id: z.string().min(1), percent: knownOrUnknown(z.number().min(0).max(100)), stage: z.enum(["pre_closing", "post_closing", "unknown"]), origin: z.enum(["declared", "extracted", "unknown"]) });
export const DealProfileSchema = z.strictObject({
  transaction_category: knownOrUnknown(z.enum(["initial_acquisition", "business_expansion", "owner_buyout", "esop_cooperative", "other"])),
  structure: knownOrUnknown(z.enum(["asset", "stock"])), purchase_price: amount, total_project_cost: amount,
  real_estate_included: yesNo, premises: z.enum(["leased", "owned", "none", "unknown"]), franchise: yesNo, franchise_brand: text,
  seller_note: knownOrUnknown(z.strictObject({ present: yesNo, amount, counted_toward_injection: yesNo })),
  gift_funds: yesNo, minority_investor_equity: yesNo,
  seller_staying: knownOrUnknown(z.strictObject({ present: yesNo, role: text, months: amount })),
  target_lender: text, expected_loan_number_date: knownOrUnknown(DateOnly), target_submission_date: knownOrUnknown(DateOnly),
  paid_agents: knownOrUnknown(z.array(z.strictObject({ id: z.string().min(1), party: text, name: text, role: text, paid_by: text, amount }))),
  equity_sources: knownOrUnknown(z.array(z.strictObject({ id: z.string().min(1), party: text, kind: knownOrUnknown(z.enum(["cash", "gift", "seller_standby_note", "other_standby_debt", "minority_investor_equity", "other"])), amount, source_account_last_four: knownOrUnknown(z.string().regex(/^\d{4}$/)) }))),
});
export type DealProfile = z.infer<typeof DealProfileSchema>;
export type Party = z.infer<typeof PartySchema>;
export type Ownership = z.infer<typeof OwnershipSchema>;
export const PROFILE_PATHS = new Set(["transaction_category", "structure", "purchase_price", "total_project_cost", "real_estate_included", "premises", "franchise", "franchise_brand", "seller_note.present", "seller_note.amount", "seller_note.counted_toward_injection", "gift_funds", "minority_investor_equity", "seller_staying.present", "seller_staying.role", "seller_staying.months", "target_lender", "expected_loan_number_date", "target_submission_date", "paid_agents", "equity_sources", ...["id", "party", "name", "role", "paid_by", "amount"].map(p => `paid_agents[].${p}`), ...["id", "party", "kind", "amount", "source_account_last_four"].map(p => `equity_sources[].${p}`)]);
