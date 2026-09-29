import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assertMutation } from "@/lib/access";
import { requireDeal } from "@/lib/deals/service";
import { requestEvaluation } from "@/lib/evaluation/run";
import type { SessionContext } from "@/lib/workspace";
import { buildIndex, footer, type IndexRow, type SourceRow } from "./index-build";
import { frozenAnswers, type FrozenAnswer } from "./answers";
import { actionLabel } from "./labels";

import { questionPolicy } from "@/lib/portal/map";
import type { PreparationReadiness } from "./readiness";
import { comparedLabel, comparison, type ConsultedEvidence } from "./comparison";
import { problemTitle, statusLabel } from "./labels";
import { documentName, reviewSubject } from "@/lib/staff/labels";
import { eventDetail as readableEvent } from "./event-detail";

/** How a package names a reviewer: "Name (email)", or "Operator" when the account is unknown. */
export function reviewerName(
  users: { id: string; displayName: string | null; email: string }[],
  id: string,
) {
  const user = users.find((u) => u.id === id);
  if (!user) return "Operator";
  return user.displayName ? `${user.displayName} (${user.email})` : user.email;
}

export type SnapshotContent = {
  /** 2: readable report with recorded answers and grouped outstanding work.
   * 3: a disagreement shows only the compared values and its problem and required action;
   * later lender work reads from its recorded tracking; the first version says so.
   * Absent on versions created before format 2. Each format keeps its own renderer. */
  format?: 2 | 3;
  number: number;
  /** Format 3: the number of the version this one is compared with; null for the first. */
  previous_version?: number | null;
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
    /** Format 3: the finding stated as what is wrong ("Purchase prices do not agree"). */
    problem_title?: string;
    /** Format 3: what the sources must show the same of ("purchase price"); null if not one value. */
    compared?: string | null;
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
    /** The answer recorded when this version was created. Absent on older versions. */
    answer?: FrozenAnswer | null;
    sides: {
      value: string;
      file: string;
      page: number | null;
      quote: string;
      package_path?: string;
      /** Format 3: readable source name and value. */
      source?: string;
      display?: string;
    }[];
    /** Format 3: what the check also consulted (signature details, rule settings), for audit. */
    evidence_consulted?: ConsultedEvidence[];
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
  change_log: { at: string; action: string; label?: string; detail: string }[];
  manifest: { package_path: string; original_filename: string; sha256: string; bytes: number }[];
};

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
  const allFacts = await db.select().from(schema.facts).where(eq(schema.facts.dealId, dealId));
  const eventDetail = (e: (typeof events)[number]) => {
    if (e.action === "segment_superseded") {
      const older = history.find(
        (s) => s.id === (e.maskedBefore as { segmentId: string })?.segmentId,
      );
      const newer = history.find(
        (s) => s.id === (e.maskedAfter as { segmentId: string })?.segmentId,
      );
      return `${newer ? documentName(newer.docType) : "Document"}: ${older ? built.originalPath(older.documentVersionId) : "prior copy"} → ${newer ? built.originalPath(newer.documentVersionId) : "current copy"}`;
    }
    if (e.action === "portal_answer") {
      const after = (e.maskedAfter ?? {}) as { taskKey?: string; choice?: string; note?: string };
      const answer = after.taskKey ? answers.get(after.taskKey) : undefined;
      const choice = { unsure: "Not sure yet", neither: "Neither value" }[after.choice ?? ""];
      return `${answer?.question ?? "Question"}: ${choice ?? after.choice ?? ""}${after.note ? ` — “${after.note}”` : ""}`.slice(
        0,
        300,
      );
    }
    // A decision on a finding names the finding, not just its new status.
    if (e.entityType === "finding" && e.action.startsWith("finding_")) {
      const f = built.findings.find((x) => x.id === e.entityId);
      if (f) {
        const after = (e.maskedAfter ?? {}) as { status?: string; reason?: string };
        const scope =
          built.partyName(f.scopeKey) === "Unassigned" ? f.scopeKey : built.partyName(f.scopeKey);
        const what = `${reviewSubject(built.rules.get(f.ruleId)?.title ?? f.ruleId)} (${f.ruleId} · ${scope === "deal" ? "Transaction" : scope}${f.period ? ` · ${f.period}` : ""})`;
        const outcome = statusLabel(
          after.status ?? (e.action === "finding_resolved" ? "resolved" : ""),
        );
        return `${what}: ${outcome}${after.reason ? ` — “${after.reason}”` : ""}`.slice(0, 300);
      }
    }
    return readableEvent(e, {
      file: (id) => (built.versions.some((v) => v.id === id) ? built.originalPath(id) : null),
      segment: (id) => {
        const s = history.find((x) => x.id === id);
        return s ? { type: s.docType, file: built.originalPath(s.documentVersionId) } : null;
      },
      fact: (id) => {
        const f = allFacts.find((x) => x.id === id);
        const s = f ? history.find((x) => x.id === f.segmentId) : undefined;
        return f
          ? {
              attribute: f.attribute,
              value: f.valueJson,
              file: s ? built.originalPath(s.documentVersionId) : null,
            }
          : null;
      },
      party: (id) => (id ? built.partyName(id) : "Not recorded"),
      question: (taskKey) => answers.get(taskKey)?.question ?? null,
    });
  };
  const [responses, users] = await Promise.all([
    db
      .select()
      .from(schema.portalResponses)
      .where(eq(schema.portalResponses.dealId, dealId))
      .orderBy(schema.portalResponses.createdAt),
    (() => {
      const actors = [
        ...new Set(
          [...events.map((e) => e.actorId), ...built.sourceRecord.map((r) => r.reviewer)].filter(
            (id): id is string => !!id,
          ),
        ),
      ];
      return actors.length
        ? db.select().from(schema.appUsers).where(inArray(schema.appUsers.id, actors))
        : Promise.resolve([]);
    })(),
  ]);
  const answers = frozenAnswers(built, responses, events, users);
  const priorEvents = new Set(previous ? (previous.contentJson as SnapshotContent).event_ids : []);
  const pathOf = (versionId: string) =>
    [...built.paths].find(([, id]) => id === versionId)?.[0] ?? "";
  const fileName = (id: string) =>
    built.versions.some((v) => v.id === id) ? built.originalPath(id) : id;
  const content: SnapshotContent = {
    format: 3,
    number: (previous?.number ?? 0) + 1,
    previous_version: previous?.number ?? null,
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
        const rule = built.rules.get(f.ruleId);
        const compared = comparison({
          rule,
          details: details.details,
          facts: built.facts,
          segments: built.segments,
          profile: built.deal.profileJson as Record<string, unknown>,
          parameters: built.pack.parameters as Record<string, unknown>,
          fileName,
          packagePath: pathOf,
          partyName: built.partyName,
        });
        return {
          finding_key: f.findingKey,
          rule_id: f.ruleId,
          title:
            questionPolicy[f.ruleId]?.title ??
            built.rules.get(f.ruleId)?.title ??
            "Staff review needed",
          problem_title: problemTitle(rule?.title ?? f.ruleId, f.status),
          compared: comparedLabel(rule),
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
          answer: answers.get(f.findingKey) ?? null,
          sides: compared.sides,
          evidence_consulted: compared.consulted,
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
        package_path: pathOf(s.documentVersionId),
      }))
      .sort(
        (a, b) =>
          a.original_filename.localeCompare(b.original_filename) || a.page_start - b.page_start,
      ),
    // The reviewer's account id stays in the frozen record; the package shows the name.
    source_record: built.sourceRecord.map((r) => ({
      ...r,
      reviewer_name: r.reviewer ? reviewerName(users, r.reviewer) : "",
    })),
    change_log: events
      .filter((e) => !priorEvents.has(e.id))
      .map((e) => ({
        at: e.createdAt.toISOString(),
        action: e.action,
        label: actionLabel(e.action),
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
    // Resolved since the previous version: open or requested there, resolved now. A finding
    // raised and settled between versions (a document missing until intake finished) is not one.
    resolved_findings: after.findings
      .filter(
        (f) =>
          f.status === "resolved" &&
          ["open", "requested"].includes(beforeFindings.get(f.finding_key)?.status ?? ""),
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
