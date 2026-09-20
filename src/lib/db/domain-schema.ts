import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  jsonb,
  integer,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import type { DealProfile } from "@/lib/domain/profile";
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// SQL migration owns composite isolation constraints and append-only triggers.
export const deals = pgTable("deals", {
  revision: integer("revision").notNull().default(1),
  id: id(),
  workspaceId: uuid("workspace_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("intake"),
  profileJson: jsonb("profile_json").$type<DealProfile>().notNull(),
  rulePackVersion: text("rule_pack_version").notNull(),
  overlayId: text("overlay_id"),
  asOfDate: date("as_of_date").notNull(),
  targetSubmissionDate: date("target_submission_date"),
  expectedLoanNumberDate: date("expected_loan_number_date"),
  createdAt: created(),
});
export const parties = pgTable("parties", {
  externalKey: text("external_key"),
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  kind: text("kind").notNull(),
  roles: text("roles").array().notNull(),
  legalName: text("legal_name").notNull(),
  nameVariants: jsonb("name_variants").notNull().default([]),
  identifierHmac: text("identifier_hmac"),
  identifierLastFour: text("identifier_last_four"),
  jointlyHeldAssets: text("jointly_held_assets").notNull().default("unknown"),
  affiliates: jsonb("affiliates").notNull().default("unknown"),
  createdAt: created(),
});
export const ownershipLinks = pgTable("ownership_links", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  ownerPartyId: uuid("owner_party_id").notNull(),
  ownedPartyId: uuid("owned_party_id").notNull(),
  percent: numeric("percent", { precision: 7, scale: 4 }),
  stage: text("stage").notNull(),
  origin: text("origin").notNull(),
  createdAt: created(),
});
export const segments = pgTable("segments", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  documentVersionId: uuid("document_version_id").notNull(),
  metadataLocator: jsonb("metadata_locator").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  docType: text("doc_type").notNull(),
  partyId: uuid("party_id"),
  period: text("period"),
  formRevision: text("form_revision"),
  signed: boolean("signed"),
  dated: boolean("dated"),
  signatureDate: date("signature_date"),
  documentDate: date("document_date"),
  expectedPageCount: integer("expected_page_count"),
  accountLastFour: text("account_last_four"),
  classificationMethod: text("classification_method").notNull(),
  classificationConfidence: numeric("classification_confidence", {
    precision: 5,
    scale: 4,
  }).notNull(),
  status: text("status").notNull(),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: created(),
});
export const events = pgTable("events", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  actorId: uuid("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  maskedBefore: jsonb("masked_before"),
  maskedAfter: jsonb("masked_after"),
  createdAt: created(),
});
export const facts = pgTable("facts", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  segmentId: uuid("segment_id").notNull(),
  subjectPartyId: uuid("subject_party_id"),
  attribute: text("attribute").notNull(),
  valueJson: jsonb("value_json").notNull(),
  normalizedValueJson: jsonb("normalized_value_json").notNull(),
  unit: text("unit").notNull(),
  period: text("period"),
  method: text("method").notNull(),
  locatorJson: jsonb("locator_json").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  confidenceComponents: jsonb("confidence_components").notNull(),
  validatorsPassed: boolean("validators_passed").notNull(),
  routingStatus: text("routing_status").notNull(),
  actorId: uuid("actor_id"),
  auditEventId: uuid("audit_event_id"),
  recordVersion: integer("record_version").notNull(),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: created(),
  documentVersionId: uuid("document_version_id"),
  verifierReason: text("verifier_reason"),
  validationJson: jsonb("validation_json").notNull().default([]),
  correctedValueJson: jsonb("corrected_value_json"),
  ambiguity: text("ambiguity"),
  reviewNote: text("review_note"),
});
export const rulePackSnapshots = pgTable("rule_pack_snapshots", {
  id: id(),
  pack: text("pack").notNull(),
  version: text("version").notNull(),
  overlayId: text("overlay_id"),
  contentHash: text("content_hash").notNull().unique(),
  canonicalJson: jsonb("canonical_json").notNull(),
  resolvedYaml: text("resolved_yaml").notNull(),
  createdAt: created(),
});
export const evaluations = pgTable("evaluations", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  rulePackHash: text("rule_pack_hash")
    .notNull()
    .references(() => rulePackSnapshots.contentHash),
  factsHash: text("facts_hash").notNull(),
  resultHash: text("result_hash").notNull(),
  durationMs: integer("duration_ms").notNull(),
  asOfDate: date("as_of_date").notNull(),
  createdAt: created(),
});
export const checklistStatus = pgTable("checklist_status", {
  id: id(),
  evaluationId: uuid("evaluation_id")
    .notNull()
    .references(() => evaluations.id),
  itemId: text("item_id").notNull(),
  scopeKey: text("scope_key").notNull(),
  period: text("period").notNull().default(""),
  status: text("status").notNull(),
  satisfyingSegmentIds: uuid("satisfying_segment_ids").array().notNull().default([]),
  reasonsJson: jsonb("reasons_json").notNull(),
});
export const findings = pgTable("findings", {
  id: id(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  findingKey: text("finding_key").notNull(),
  ruleId: text("rule_id").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  scopeKey: text("scope_key").notNull(),
  period: text("period"),
  detailsJson: jsonb("details_json").notNull(),
  status: text("status").notNull().default("open"),
  responsibleRole: text("responsible_role").notNull(),
  firstSeenEvaluationId: uuid("first_seen_evaluation_id").notNull(),
  lastSeenEvaluationId: uuid("last_seen_evaluation_id").notNull(),
  resolutionNote: text("resolution_note"),
  resolverId: uuid("resolver_id"),
  createdAt: created(),
});
export const dealBatches = pgTable("deal_batches", {
  id: id(),
  dealId: uuid("deal_id").notNull(),
  number: integer("number").notNull(),
  actorId: uuid("actor_id").notNull(),
  createdAt: created(),
});
export const intakeFiles = pgTable("intake_files", {
  id: id(),
  batchId: uuid("batch_id").notNull(),
  documentVersionId: uuid("document_version_id").notNull(),
  originalPath: text("original_path").notNull(),
  contentHash: text("content_hash").notNull(),
  duplicate: boolean("duplicate").notNull(),
  runId: uuid("run_id").notNull(),
  createdAt: created(),
});
export const intakeReviews = pgTable("intake_reviews", {
  id: id(),
  dealId: uuid("deal_id").notNull(),
  documentVersionId: uuid("document_version_id").notNull(),
  recordVersionId: uuid("record_version_id"),
  segmentId: uuid("segment_id"),
  attribute: text("attribute"),
  type: text("type").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  reason: text("reason").notNull(),
  createdAt: created(),
});
export const attestations = pgTable("attestations", {
  id: id(),
  dealId: uuid("deal_id").notNull(),
  kind: text("kind").notNull(),
  ruleId: text("rule_id").notNull(),
  scopeKey: text("scope_key").notNull(),
  period: text("period").notNull().default(""),
  key: text("key").notNull().default(""),
  state: text("state"),
  confirmed: boolean("confirmed"),
  note: text("note").notNull(),
  actorId: uuid("actor_id").notNull(),
  auditEventId: uuid("audit_event_id").notNull(),
  createdAt: created(),
});
