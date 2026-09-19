import { z } from "zod";
import { DocumentTypeSchema, FactAttributeSchema } from "@/lib/domain/registry";
import { DateOnly, PROFILE_PATHS } from "@/lib/domain/profile";
export const SCOPES = ["deal", "buyer_entity", "target_business", "per_guarantor", "per_owner_or_guarantor", "per_affiliate", "per_equity_source", "per_paid_agent"] as const;
export const CHECK_TYPES = ["presence", "freshness", "signed_and_dated", "period_coverage", "form_revision", "page_completeness", "arithmetic", "fact_agreement", "fact_comparison", "date_order", "manual_confirmation", "tracking"] as const;
export const OPERATORS = ["and", "or", "not", "==", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/", "in", "exists", "sum", "min", "max", "abs", "days_between", "add_days", "add_years"] as const;
export type Expr = string | number | boolean | null | (string | number | boolean | null)[] | { fact: string; types?: string[]; select?: "one" | "sum" | "latest" | "list"; field?: string; within_days?: number; relative_to?: string } | { profile: string; kinds?: string[] } | { param: string } | { as_of: true } | { op: typeof OPERATORS[number]; args: Expr[] };
const ExprBase: z.ZodType<Expr> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).max(100),
  z.strictObject({ fact: FactAttributeSchema, types: z.array(DocumentTypeSchema).min(1).optional(), select: z.enum(["one", "sum", "latest", "list"]).optional(), field: z.enum(["amount", "percent", "balance", "payment"]).optional(), within_days: z.number().nonnegative().optional(), relative_to: FactAttributeSchema.optional() }),
  z.strictObject({ profile: z.string().refine(p => PROFILE_PATHS.has(p), "Unknown profile path"), kinds: z.array(z.enum(["cash", "gift", "seller_standby_note", "other_standby_debt", "minority_investor_equity", "other"])).optional() }),
  z.strictObject({ param: z.string().regex(/^[a-z][a-z0-9_]*$/) }), z.strictObject({ as_of: z.literal(true) }),
  z.strictObject({ op: z.enum(OPERATORS), args: z.array(ExprBase).max(32) }).superRefine((e, ctx) => {
    const unary = ["not", "exists", "sum", "min", "max", "abs"].includes(e.op);
    const variadic = ["and", "or"].includes(e.op);
    if (unary ? e.args.length !== 1 : variadic ? e.args.length < 1 : e.args.length !== 2) ctx.addIssue({ code: "custom", message: `Invalid arity for ${e.op}` });
  }),
]));
export const ExprSchema = ExprBase;
export const SourceSchema = z.strictObject({ class: z.enum(["sop", "sba_form", "cfr", "secondary", "lender_convention", "internal_consistency"]), citation: z.string().min(1), url: z.url().refine(u => /^https?:\/\//.test(u), "Only HTTP source URLs").optional() }).refine(s => ["lender_convention", "internal_consistency"].includes(s.class) || !!s.url, "This source class requires a URL");
export const CheckSchema = z.strictObject({
  type: z.enum(CHECK_TYPES), message: z.string().min(1),
  fact: FactAttributeSchema.optional(), facts: z.array(FactAttributeSchema).optional(),
  metadata: z.enum(["signature_date", "document_date"]).optional(),
  expr: ExprSchema.optional(), across: z.array(DocumentTypeSchema).optional(),
  mode: z.enum(["values", "owners", "party_name", "party_assignment", "account_holder", "buyer_seller"]).optional(),
  profile: z.string().refine(p => PROFILE_PATHS.has(p), "Unknown profile path").optional(),
  max_age_param: z.string().optional(), revision_param: z.string().optional(),
  tolerance_param: z.string().optional(), note_key: z.string().optional(),
  signed_only: z.boolean().optional(),
  when: ExprSchema.optional(),
}).superRefine((c, ctx) => {
  const require = (condition: boolean, message: string) => { if (!condition) ctx.addIssue({ code: "custom", message }); };
  if (["arithmetic", "fact_comparison", "date_order"].includes(c.type)) require(!!c.expr, `${c.type} requires an expression`);
  if (c.type === "freshness") require(!!(c.fact || c.metadata) && !!c.max_age_param, "freshness requires a date and parameter");
  if (c.type === "form_revision") require(!!c.revision_param, "form_revision requires a parameter");
  if (c.type === "manual_confirmation") require(!!c.note_key, "manual_confirmation requires a key");
  if (c.type === "fact_agreement") require(!!(c.fact || c.mode), "fact_agreement requires a fact or mode");
});
export const RuleSchema = z.strictObject({
  id: z.string().regex(/^[A-Z]+-\d{2}[a-z]?$/), title: z.string().min(1), description: z.string().min(1),
  scope: z.enum(SCOPES), period_requirement: z.enum(["last_three_tax_years", "last_three_fiscal_year_ends", "last_two_months"]).optional(),
  applies_when: ExprSchema, accepts: z.array(DocumentTypeSchema), required: z.boolean(), severity: z.enum(["blocker", "major", "minor", "info"]), responsible: z.string().min(1),
  checks: z.array(CheckSchema).min(1), source_ref: SourceSchema, verified: z.literal(false), finding_type: z.enum(["missing", "stale", "incomplete", "conflict", "needs_review", "info"]).optional(),
});
export const PackSchema = z.strictObject({
  pack: z.literal("sba7a-cho"), version: z.string().min(1), effective: z.strictObject({ loan_number_on_or_after: DateOnly, loan_number_before: DateOnly.optional() }), verified: z.literal(false),
  parameters: z.record(z.string(), z.union([z.number().finite(), z.string(), z.boolean()])),
  index: z.strictObject({ folders: z.array(z.string()).min(1), filename_template: z.string().min(1) }),
  items: z.array(RuleSchema).min(1), consistency: z.array(RuleSchema).min(1),
});
export const OverlaySchema = z.strictObject({
  id: z.string().min(1), verified: z.literal(false), parameters: z.record(z.string(), z.union([z.number().finite(), z.string(), z.boolean()])).default({}),
  index: z.strictObject({ folders: z.array(z.string()).min(1).optional(), filename_template: z.string().min(1).optional() }).optional(),
  operations: z.array(z.discriminatedUnion("op", [
    z.strictObject({ op: z.literal("add"), collection: z.enum(["items", "consistency"]), rule: RuleSchema }),
    z.strictObject({ op: z.literal("remove"), id: z.string() }),
    z.strictObject({ op: z.literal("set"), id: z.string(), changes: RuleSchema.omit({ id: true }).partial() }),
  ])),
});
export type Rule = z.infer<typeof RuleSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Pack = z.infer<typeof PackSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type ResolvedPack = Pack & { overlay: string | null; content_hash: string };
