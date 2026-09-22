import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { requestEvaluation } from "@/lib/evaluation/run";
import type { SessionContext } from "@/lib/workspace";
import { buildIndex, footer, type IndexRow, type SourceRow } from "./index-build";

import { questionPolicy } from "@/lib/portal/map";
import type { PreparationReadiness } from "./readiness";

export type SnapshotContent = {
  number: number;
  deal: { code: string; name: string; pack: string; version: string; overlay: string | null };
  created_at: string;
  event_ids: string[];
  readiness: { satisfied: number; applicable: number };
  preparation?: PreparationReadiness;
  footer: string;
  index: IndexRow[];
  findings: {
    finding_key: string;
    rule_id: string;
    title?: string;
    description?: string;
    responsible?: string;
    submission_stage?: string;
    type: string;
    severity: string;
    party: string;
    period: string | null;
    status: string;
    message: string;
    reason: string | null;
    sides: {
      value: string;
      file: string;
      page: number | null;
      quote: string;
      package_path?: string;
    }[];
  }[];
  segment_locations?: {
    id: string;
    type: string;
    subject: string;
    original_filename: string;
    page_start: number;
    page_end: number;
    package_path: string;
  }[];
  source_record: SourceRow[];
  change_log: { at: string; action: string; detail: string }[];
  manifest: { package_path: string; original_filename: string; sha256: string; bytes: number }[];
};

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** Freeze the evaluation, the index and a manifest with file hashes. Immutable and numbered per deal. */
export async function createSnapshot(
  context: SessionContext,
  dealId: string,
  options: { requirePrepared?: boolean } = {},
) {
  await assertMutation(context, "deal-snapshot");
  await requireDeal(context, dealId);
  await requestEvaluation(dealId);
  const built = await buildIndex(dealId);
  if (options.requirePrepared && !built.preparation.ready)
    throw Error("The current file is not prepared for lender review.");
  if (!built.evaluation) throw Error("Evaluate the deal before taking a snapshot");
  const db = getDb();
  const previous = await latestSnapshot(dealId);
  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.dealId, dealId))
    .orderBy(schema.events.createdAt);
  const history = await db.select().from(schema.segments).where(eq(schema.segments.dealId, dealId));
  const eventDetail = (e: (typeof events)[number]) => {
    if (e.action === "segment_superseded") {
      const older = history.find(
        (s) => s.id === (e.maskedBefore as { segmentId: string })?.segmentId,
      );
      const newer = history.find(
        (s) => s.id === (e.maskedAfter as { segmentId: string })?.segmentId,
      );
      return `${newer?.docType ?? "Document"}: ${older ? built.originalPath(older.documentVersionId) : "prior copy"} → ${newer ? built.originalPath(newer.documentVersionId) : "current copy"}`;
    }
    return JSON.stringify(e.maskedAfter ?? {}).slice(0, 300);
  };
  const priorEvents = new Set(previous ? (previous.contentJson as SnapshotContent).event_ids : []);
  const content: SnapshotContent = {
    number: (previous?.number ?? 0) + 1,
    deal: {
      code: built.deal.code,
      name: built.deal.name,
      pack: built.pack.pack,
      version: built.pack.version,
      overlay: built.pack.overlay,
    },
    created_at: new Date().toISOString(),
    event_ids: events.map((e) => e.id),
    readiness: {
      satisfied: built.preparation.satisfied + built.preparation.waived,
      applicable: built.preparation.applicable,
    },
    preparation: built.preparation,
    footer: footer(built.pack),
    index: built.index,
    findings: built.findings
      .map((f) => {
        const details = (f.detailsJson as {
          message: string;
          details: {
            fact_id: string | null;
            value: unknown;
            file: string;
            page: number | null;
            quote: string;
          }[];
        }) ?? { message: "", details: [] };
        return {
          finding_key: f.findingKey,
          rule_id: f.ruleId,
          title:
            questionPolicy[f.ruleId]?.title ??
            built.rules.get(f.ruleId)?.title ??
            "Staff review needed",
          description: built.rules.get(f.ruleId)?.description ?? details.message,
          responsible: built.responsibility(f.responsibleRole),
          submission_stage: built.rules.get(f.ruleId)?.submission_stage ?? "unknown",
          type: f.type,
          severity: f.severity,
          party:
            built.partyName(f.scopeKey) === "Unassigned" ? f.scopeKey : built.partyName(f.scopeKey),
          period: f.period,
          status: f.status,
          message: details.message,
          reason: f.reason,
          sides: details.details.map((d) => ({
            value: show(d.value),
            file: built.versions.some((v) => v.id === d.file) ? built.originalPath(d.file) : d.file,
            package_path: [...built.paths].find(([, id]) => id === d.file)?.[0] ?? "",
            page: d.page,
            quote: d.quote,
          })),
        };
      })
      .sort((a, b) => a.finding_key.localeCompare(b.finding_key)),
    segment_locations: built.segments
      .map((s) => ({
        id: s.id,
        type: s.docType,
        subject: built.partyName(s.partyId),
        original_filename: built.originalPath(s.documentVersionId),
        page_start: s.pageStart,
        page_end: s.pageEnd,
        package_path: [...built.paths].find(([, id]) => id === s.documentVersionId)?.[0] ?? "",
      }))
      .sort(
        (a, b) =>
          a.original_filename.localeCompare(b.original_filename) || a.page_start - b.page_start,
      ),
    source_record: built.sourceRecord,
    change_log: events
      .filter((e) => !priorEvents.has(e.id))
      .map((e) => ({
        at: e.createdAt.toISOString(),
        action: e.action,
        detail: eventDetail(e),
      })),
    manifest: [...built.paths.entries()]
      .map(([path, versionId]) => {
        const version = built.versions.find((v) => v.id === versionId)!;
        return {
          package_path: path,
          original_filename: built.originalPath(versionId),
          sha256: version.contentHash,
          bytes: version.byteSize ?? 0,
        };
      })
      .sort((a, b) => a.package_path.localeCompare(b.package_path)),
  };
  const diff = diffSnapshots(previous ? (previous.contentJson as SnapshotContent) : null, content);
  const [row] = await db
    .insert(schema.snapshots)
    .values({
      dealId,
      number: content.number,
      evaluationId: built.evaluation.id,
      contentJson: content,
      diffJson: diff,
      actorId: context.user.id,
    })
    .returning();
  await db.insert(schema.events).values({
    dealId,
    actorId: context.user.id,
    action: "snapshot_created",
    entityType: "snapshot",
    entityId: row!.id,
    maskedAfter: { number: content.number, files: content.manifest.length },
  });
  return row!;
}

export type SnapshotDiff = {
  newly_satisfied: string[];
  new_findings: string[];
  resolved_findings: string[];
  documents_added: string[];
  documents_superseded: string[];
  reviewer_corrections: number;
  dismissals: string[];
  waivers: string[];
};

/** The diff the package screen shows: what changed since the previous snapshot. */
export function diffSnapshots(
  before: SnapshotContent | null,
  after: SnapshotContent,
): SnapshotDiff {
  const key = (r: IndexRow) => `${r.item_id} · ${r.party}${r.period ? ` · ${r.period}` : ""}`;
  const beforeRows = new Map((before?.index ?? []).map((r) => [key(r), r.status]));
  const beforeFindings = new Map((before?.findings ?? []).map((f) => [f.finding_key, f]));
  const beforePaths = new Set((before?.manifest ?? []).map((m) => m.original_filename));
  const label = (k: string) => {
    const f = after.findings.find((x) => x.finding_key === k) ?? beforeFindings.get(k)!;
    return `${f.rule_id} · ${f.party}${f.period ? ` · ${f.period}` : ""} · ${f.type}`;
  };
  return {
    newly_satisfied: after.index
      .filter(
        (r) =>
          ["satisfied", "waived"].includes(r.status) &&
          !["satisfied", "waived"].includes(beforeRows.get(key(r)) ?? ""),
      )
      .map(key)
      .sort(),
    new_findings: after.findings
      .filter(
        (f) => !beforeFindings.has(f.finding_key) && !["resolved", "dismissed"].includes(f.status),
      )
      .map((f) => label(f.finding_key))
      .sort(),
    resolved_findings: after.findings
      .filter(
        (f) => f.status === "resolved" && beforeFindings.get(f.finding_key)?.status !== "resolved",
      )
      .map((f) => label(f.finding_key))
      .sort(),
    documents_added: [...new Set(after.manifest.map((m) => m.original_filename))]
      .filter((f) => !beforePaths.has(f))
      .sort(),
    documents_superseded: after.change_log
      .filter((e) => e.action === "segment_superseded")
      .map((e) => e.detail)
      .sort(),
    reviewer_corrections: after.change_log.filter((e) =>
      [
        "fact_edit_accept",
        "fact_accept",
        "fact_reject",
        "fact_needs_source",
        "fact_entered",
      ].includes(e.action),
    ).length,
    dismissals: after.findings
      .filter(
        (f) =>
          f.status === "dismissed" && beforeFindings.get(f.finding_key)?.status !== "dismissed",
      )
      .map((f) => label(f.finding_key))
      .sort(),
    waivers: after.findings
      .filter(
        (f) => f.status === "waived" && beforeFindings.get(f.finding_key)?.status !== "waived",
      )
      .map((f) => label(f.finding_key))
      .sort(),
  };
}

export async function latestSnapshot(dealId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.dealId, dealId))
    .orderBy(desc(schema.snapshots.number))
    .limit(1);
  return row ?? null;
}
export async function listSnapshots(dealId: string) {
  return getDb()
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.dealId, dealId))
    .orderBy(desc(schema.snapshots.number));
}
