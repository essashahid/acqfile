import { deals } from "./domain-schema";
export * from "./domain-schema";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  numeric,
  primaryKey,
  bigserial,
} from "drizzle-orm/pg-core";

export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  firmName: text("firm_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    role: text("role", { enum: ["admin", "reviewer", "viewer", "adviser"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const documents = pgTable("documents", {
  dealId: uuid("deal_id").references(() => deals.id),
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  logicalKey: text("logical_key").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const PARSE_STATUSES = ["pending", "parsed", "failed", "unsupported"] as const;
export const PROCESSING_STATUSES = [
  "queued",
  "processing",
  "completed",
  "completed_with_review",
  "failed",
  "unsupported",
] as const;

export const documentVersions = pgTable("document_versions", {
  dealId: uuid("deal_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  versionNumber: integer("version_number").notNull(),
  contentHash: text("content_hash").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sourceFilename: text("source_filename").notNull(),
  supersedesVersionId: uuid("supersedes_version_id"),
  isCurrent: boolean("is_current").notNull().default(true),
  parseStatus: text("parse_status", { enum: PARSE_STATUSES }).notNull().default("pending"),
  processingStatus: text("processing_status", { enum: PROCESSING_STATUSES })
    .notNull()
    .default("queued"),
  pageCount: integer("page_count"),
  charCount: integer("char_count"),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "completed_with_review",
  "failed",
] as const;

export const processingRuns = pgTable("processing_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  runType: text("run_type", { enum: ["ingest", "reprocess", "eval", "backfill"] }).notNull(),
  pipelineVersion: text("pipeline_version").notNull(),
  provider: text("provider").notNull(),
  modelConfigHash: text("model_config_hash").notNull(),
  status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
  currentStep: text("current_step"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  documentsTotal: integer("documents_total").notNull().default(0),
  documentsCompleted: integer("documents_completed").notNull().default(0),
  documentsFailed: integer("documents_failed").notNull().default(0),
  reviewItemsCreated: integer("review_items_created").notNull().default(0),
  retries: integer("retries").notNull().default(0),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 })
    .notNull()
    .default("0"),
  initiatedBy: uuid("initiated_by"),
  configJson: jsonb("config_json").$type<RunConfig>().notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RunConfig = {
  /** Test hook: fail the named step on its first N attempts. */
  injectFailure?: { step: string; attempts: number };
  label?: string;
  documentVersionIds?: string[];
  [k: string]: unknown;
};

export const STEP_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
  "skipped",
] as const;

export const runSteps = pgTable("run_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  processingRunId: uuid("processing_run_id")
    .notNull()
    .references(() => processingRuns.id),
  documentVersionId: uuid("document_version_id"),
  stepName: text("step_name").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status", { enum: STEP_STATUSES }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  latencyMs: integer("latency_ms"),
  outputRef: text("output_ref"),
  outputJson: jsonb("output_json"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const llmCalls = pgTable("llm_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  processingRunId: uuid("processing_run_id"),
  documentVersionId: uuid("document_version_id"),
  purpose: text("purpose", { enum: ["extract", "verify", "classify"] }).notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version"),
  idempotencyKey: text("idempotency_key"),
  cacheHit: boolean("cache_hit").notNull().default(false),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordVersions = pgTable("record_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersions.id),
  parentRecordVersionId: uuid("parent_record_version_id"),
  versionNumber: integer("version_number").notNull(),
  createdByType: text("created_by_type", { enum: ["model", "reviewer", "reprocess"] }).notNull(),
  createdByUserId: uuid("created_by_user_id"),
  payloadJson: jsonb("payload_json").notNull(),
  changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ROUTING_STATUSES = [
  "auto_accepted",
  "review",
  "blocked",
  "accepted",
  "rejected",
  "needs_source",
] as const;
export type RoutingStatus = (typeof ROUTING_STATUSES)[number];

export const runEvents = pgTable("run_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  processingRunId: uuid("processing_run_id")
    .notNull()
    .references(() => processingRuns.id),
  documentVersionId: uuid("document_version_id"),
  level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deadLetters = pgTable("dead_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  processingRunId: uuid("processing_run_id")
    .notNull()
    .references(() => processingRuns.id),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersions.id),
  failedStep: text("failed_step").notNull(),
  errorCode: text("error_code").notNull(),
  errorMessage: text("error_message").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  retryable: boolean("retryable").notNull().default(true),
  status: text("status", { enum: ["open", "retrying", "resolved"] })
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
