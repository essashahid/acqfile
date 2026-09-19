import fs from "node:fs";
import path from "node:path";
import { sql, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { ReportRecord } from "@/lib/schema/report";

export const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "legacy");
export const DOCUMENTS_DIR = path.join(FIXTURES_DIR, "documents");

export type ManifestFile = { filename: string; truth: string; expect: "processed" | "new_version" | "duplicate"; supersedes?: string; duplicate_of?: string };
export type CorpusManifest = { files: ManifestFile[] };

export type UncertainField = {
  field_path: string;
  kind: string;
  reason: string;
  extractor_value: unknown;
  extractor_locators: string[];
  extractor_quotes: string[];
  extractor_ambiguity: string | null;
  verifier: { status: string; corrected_value: unknown; contradiction_detected: boolean; evidence_specificity: number };
  expect_routed: boolean;
};

export type TruthFile = {
  logical_key: string;
  version: number;
  format: "pdf" | "docx";
  filename: string;
  display_name: string;
  record: ReportRecord;
  evidence: Record<string, { locators: string[]; quotes: string[] }>;
  uncertain_fields: UncertainField[];
  distractors: { kind: string; text: string; note: string }[];
  expect_duplicate_files: string[];
  supersedes: string | null;
  superseded_by: string | null;
};

export function loadManifest(): CorpusManifest {
  return JSON.parse(fs.readFileSync(path.join(DOCUMENTS_DIR, "manifest.json"), "utf8")) as CorpusManifest;
}

export function loadTruthFiles(): Map<string, TruthFile> {
  const dir = path.join(FIXTURES_DIR, "truth");
  const out = new Map<string, TruthFile>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as TruthFile;
    out.set(`${t.logical_key}-v${t.version}`, t);
  }
  return out;
}

/** The corpus version: a hash over the manifest filenames and truth keys (changes when fixtures change). */
export function corpusFingerprint(): string {
  const manifest = loadManifest();
  return manifest.files.map((f) => `${f.filename}:${f.truth}:${f.expect}`).join("|");
}

/**
 * Upsert the extraction evaluation cases from the fixtures (spec sections 28 to 31):
 * per truth version: extraction, provenance, classification, review_routing;
 * per manifest: duplicate and version cases.
 */
export async function seedEvalCases(): Promise<number> {
  const db = getDb();
  const rows: (typeof schema.evalCases.$inferInsert)[] = [];
  for (const [key, t] of loadTruthFiles()) {
    rows.push({ caseKey: `extract:${key}`, caseType: "extraction", documentLogicalKey: t.logical_key, expectedJson: { version: t.version, record: t.record }, tags: ["extraction", t.format] });
    rows.push({ caseKey: `provenance:${key}`, caseType: "provenance", documentLogicalKey: t.logical_key, expectedJson: { version: t.version, evidence: t.evidence }, tags: ["provenance"] });
    rows.push({ caseKey: `classify:${key}`, caseType: "classification", documentLogicalKey: t.logical_key, expectedJson: { version: t.version, document_type: t.record.document_type }, tags: ["classification"] });
    rows.push({
      caseKey: `review:${key}`,
      caseType: "review_routing",
      documentLogicalKey: t.logical_key,
      expectedJson: { version: t.version, uncertain_fields: t.uncertain_fields.map((u) => ({ field_path: u.field_path, kind: u.kind, expect_routed: u.expect_routed })) },
      tags: ["review"],
    });
  }
  let manifest: CorpusManifest | null = null;
  try {
    manifest = loadManifest();
  } catch {
    manifest = null;
  }
  for (const f of manifest?.files ?? []) {
    if (f.expect === "duplicate") rows.push({ caseKey: `duplicate:${f.filename}`, caseType: "duplicate", expectedJson: { filename: f.filename, duplicate_of: f.duplicate_of }, tags: ["duplicate"] });
    if (f.expect === "new_version") rows.push({ caseKey: `version:${f.truth}`, caseType: "version", documentLogicalKey: f.truth.split("-v")[0], expectedJson: { filename: f.filename, supersedes: f.supersedes }, tags: ["version"] });
  }
  for (const r of rows) {
    await db
      .insert(schema.evalCases)
      .values(r)
      .onConflictDoUpdate({ target: schema.evalCases.caseKey, set: { caseType: r.caseType, documentLogicalKey: r.documentLogicalKey ?? null, expectedJson: r.expectedJson, tags: r.tags ?? [], active: sql`true` } });
  }
  // deactivate cases that no longer exist in the fixtures
  const keys = rows.map((r) => r.caseKey);
  if (keys.length) await db.update(schema.evalCases).set({ active: false }).where(notInArray(schema.evalCases.caseKey, keys));
  return rows.length;
}
