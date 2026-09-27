import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requiredPreparationRows, stageOf } from "@/lib/deliverables/readiness";
import { buildIndex, type IndexRow } from "@/lib/deliverables/index-build";
import { listRequests, ageInDays, draftRecipient } from "@/lib/deliverables/requests";
import { listSnapshots } from "@/lib/deliverables/snapshot";
import { PENDING } from "@/lib/evaluation/run";
import {
  attentionKind,
  attributeName,
  documentName,
  factValue,
  findingHeadline,
  responsibleName,
  reviewSubject,
} from "./labels";
import { actionHref, checksFromMessage, explainItem } from "./explain";
import { comparisonLine, comparisonSides, type Detail } from "./compare";

/**
 * Where an item sits in the operator's queue. The order is the order of work: what stops the
 * file, what the operator can finish now, what waits on another party, then lender tracking.
 * Grouping is display only; readiness and each item's status are computed elsewhere.
 */
export type Stage = "blocks" | "yours" | "waiting" | "lender" | "info";
export const STAGES: Stage[] = ["blocks", "yours", "waiting", "lender", "info"];
export type WorkItem = {
  key: string;
  stage: Stage;
  kind: "finding" | "processing" | "values" | "filing";
  title: string;
  /** The person or business the item is about. */
  subject: string;
  /** What is wrong, in a few words. */
  issue: string;
  /** Whose turn it is: "You", or the party the follow-up draft is addressed to. */
  turn: string;
  href: string;
  /** The step's own verb. */
  action: string;
  /** Read-only accounts see what the link shows instead of a verb they cannot perform. */
  view: string;
  /** Order inside its group: higher priority first. */
  order: number;
};

/** Counts an operator can act on. Each one means a different thing and none of them are merged. */
export type DealCounts = {
  /** Applicable required requirements only. Non-applicable rows are never in the denominator. */
  required: { done: number; applicable: number };
  notApplicable: number;
  byStatus: Record<string, number>;
  findingsOpen: number;
  findingsTotal: number;
  blockers: number;
  informational: number;
  arrivals: number;
  filed: number;
  documentsNeedingAttention: number;
  pendingValues: number;
  followUpsToPrepare: number;
  /** Follow-up drafts waiting to be sent: one per recipient, as Follow-ups builds them. */
  drafts: number;
  requestsRecorded: number;
  oldestRequestDays: number | null;
  versions: number;
};

/**
 * The operator's view of one deal, assembled once. Screens read from this so a count shown on the
 * rail, the overview and a section can never disagree.
 */
export async function dealView(dealId: string) {
  const db = getDb();
  const built = await buildIndex(dealId);
  const [requests, snapshots, arrivals, openReviews, pendingFacts, runs, sourceFacts, allSegments] =
    await Promise.all([
      listRequests(dealId),
      listSnapshots(dealId),
      db
        .select({
          arrival: schema.intakeFiles,
          batch: schema.dealBatches.number,
          version: schema.documentVersions,
        })
        .from(schema.intakeFiles)
        .innerJoin(
          schema.dealBatches,
          and(
            eq(schema.dealBatches.id, schema.intakeFiles.batchId),
            eq(schema.dealBatches.dealId, dealId),
          ),
        )
        .innerJoin(
          schema.documentVersions,
          eq(schema.documentVersions.id, schema.intakeFiles.documentVersionId),
        )
        .orderBy(desc(schema.dealBatches.number)),
      db
        .select()
        .from(schema.intakeReviews)
        .where(
          and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open")),
        ),
      db
        .select()
        .from(schema.facts)
        .where(
          and(
            eq(schema.facts.dealId, dealId),
            eq(schema.facts.isCurrent, true),
            inArray(schema.facts.routingStatus, [...PENDING]),
          ),
        ),
      db.select().from(schema.processingRuns).where(eq(schema.processingRuns.status, "failed")),
      db.select().from(schema.facts).where(eq(schema.facts.dealId, dealId)),
      // Proposed filings are not in the filed set but a filing decision still needs their names.
      db.select().from(schema.segments).where(eq(schema.segments.dealId, dealId)),
    ]);

  const ready = built.preparation;
  const byStatus: Record<string, number> = {};
  for (const r of built.index) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const open = built.findings.filter((f) => ["open", "requested"].includes(f.status));
  const blockers = open.filter(
    (f) => f.severity === "blocker" && stageOf(built.rules.get(f.ruleId)) !== "later_lender",
  );
  const informational = open.filter((f) => f.type === "info" || f.severity === "info");
  const failedFiles = arrivals.filter(
    (r) =>
      r.version.parseStatus === "failed" ||
      ["failed", "dead_letter"].includes(r.version.processingStatus),
  );
  const base = `/staff/deals/${dealId}`;
  const party = (key: string) =>
    built.partyName(key) === "Unassigned"
      ? key === "deal"
        ? "Transaction"
        : key
      : built.partyName(key);

  // The explanation Review shows. Consistency rules have no requirement row, so their checks come
  // from the finding itself, as on Review; otherwise the summary would fall back to "not on file".
  const explain = (f: (typeof built.findings)[number]) => {
    const rule = built.rules.get(f.ruleId);
    if (!rule) return null;
    const row = built.index.find(
      (r) =>
        r.item_id === f.ruleId && r.scope_key === f.scopeKey && (r.period || null) === f.period,
    );
    const message = (f.detailsJson as { message: string }).message;
    return {
      row,
      ex: explainItem({
        rule,
        status: row?.status ?? "needs_review",
        checks: row ? row.checks : checksFromMessage(rule, message),
        findingType: f.type,
        findingMessage: message,
        parameters: built.pack.parameters,
      }),
    };
  };

  // Follow-ups still to prepare: open findings not yet covered by a recorded request.
  const toPrepare = built.findings.filter(
    (f) => f.status === "open" && f.type !== "info" && f.severity !== "info",
  );
  const outstanding = requests.filter((r) =>
    built.findings.some((f) => r.findingKeys.includes(f.findingKey) && f.status === "requested"),
  );
  const recipientOf = (f: (typeof built.findings)[number]) =>
    draftRecipient(f, built.rules.get(f.ruleId), built.partyName);

  const work: WorkItem[] = [];
  const findingItem = (f: (typeof built.findings)[number], stage: Stage): WorkItem => {
    const rule = built.rules.get(f.ruleId);
    const e = explain(f);
    const details = ((f.detailsJson as { details?: Detail[] }).details ?? []) as Detail[];
    const line =
      e && ["disagreement", "relationship"].includes(e.ex.family)
        ? comparisonLine(
            comparisonSides(rule, details, {
              segments: built.segments,
              facts: sourceFacts,
              versions: built.versions,
              parameters: built.pack.parameters,
            }),
          )
        : "";
    const review = `${base}/review?finding=${encodeURIComponent(f.findingKey)}&from=overview`;
    const rowKey = e?.row ? `${e.row.item_id}|${e.row.scope_key}|${e.row.period}` : undefined;
    const record =
      e && ["confirm", "tracking"].includes(e.ex.action.kind)
        ? actionHref(e.ex.action.kind, base, { rowKey, noteKey: e.ex.action.noteKey })
        : null;
    const verb = !e
      ? "Open item"
      : ["disagreement", "relationship"].includes(e.ex.family)
        ? "Compare sources"
        : e.ex.family === "missing"
          ? "Prepare request"
          : record
            ? e.ex.action.label
            : "Open item";
    return {
      key: `finding:${f.findingKey}`,
      stage,
      kind: "finding",
      title: reviewSubject(
        rule?.title ?? findingHeadline(f.type, (f.detailsJson as { message: string }).message),
      ),
      subject: party(f.scopeKey) + (f.period ? ` · ${f.period}` : ""),
      issue:
        line ||
        e?.ex.brief ||
        findingHeadline(f.type, (f.detailsJson as { message: string }).message),
      turn: responsibleName(recipientOf(f).split("·")[0]!),
      href: record ?? review,
      action: verb,
      view: "View evidence",
      order: { blocker: 0, major: 1, minor: 2 }[f.severity] ?? 3,
    };
  };
  for (const f of blockers) work.push(findingItem(f, "blocks"));

  // Work the operator can finish now: unreadable files, filing decisions and values to confirm.
  const failedVersions = new Set(failedFiles.map((r) => r.version.id));
  for (const r of failedFiles)
    work.push({
      key: `file:${r.version.id}`,
      stage: "yours",
      kind: "processing",
      title: "Could not be read",
      subject: r.arrival.originalPath.split("/").pop() ?? "Source file",
      issue: "Supplies no evidence until it is read or replaced",
      turn: "You",
      href: `${base}/documents/${r.version.id}`,
      action: "See options",
      view: "View file",
      order: 0,
    });
  const filename = (versionId: string) =>
    built.versions.find((x) => x.id === versionId)?.sourceFilename ?? "Source file";
  const segmentsPending = new Set(pendingFacts.map((f) => f.segmentId));
  for (const id of segmentsPending) {
    const segment = built.segments.find((s) => s.id === id);
    if (!segment) continue;
    const mine = pendingFacts.filter((f) => f.segmentId === id);
    const one = mine.length === 1 ? mine[0]! : null;
    work.push({
      key: `segment:${id}`,
      stage: "yours",
      kind: "values",
      title: one
        ? attributeName(one.attribute).split(" · ").at(-1)!
        : `${mine.length} values to confirm`,
      subject: `${documentName(segment.docType)} · ${filename(segment.documentVersionId)}`,
      issue: one
        ? `Reads ${factValue(one.attribute, one.unit, one.valueJson)} · confirm or correct`
        : mine
            .map((f) => attributeName(f.attribute).split(" · ").at(-1)!)
            .slice(0, 3)
            .join(", "),
      turn: "You",
      href: `${base}/documents/${segment.documentVersionId}/values/${id}?from=overview`,
      action: mine.length === 1 ? "Review value" : "Review values",
      view: "View values",
      order: 1,
    });
  }
  // One row per document waiting on a filing decision; its separate intake checks travel together.
  const reviewsByVersion = new Map<string, typeof openReviews>();
  for (const r of openReviews) {
    if (failedVersions.has(r.documentVersionId)) continue;
    reviewsByVersion.set(r.documentVersionId, [
      ...(reviewsByVersion.get(r.documentVersionId) ?? []),
      r,
    ]);
  }
  for (const [versionId, reviews] of reviewsByVersion) {
    const gap = reviews.find((r) => r.type === "extraction_gap" && r.segmentId);
    const named = reviews.find((r) => r.segmentId)?.segmentId;
    const segment =
      allSegments.find((s) => s.id === (gap?.segmentId ?? named)) ??
      allSegments.find((s) => s.documentVersionId === versionId && s.isCurrent);
    const replacement = reviews.find((r) => ["version_conflict", "duplicate"].includes(r.type));
    const others = segment
      ? built.segments
          .filter(
            (s) =>
              s.documentVersionId !== versionId &&
              s.docType === segment.docType &&
              (s.partyId ?? null) === (segment.partyId ?? null),
          )
          .map((s) => filename(s.documentVersionId))
      : [];
    const type = (replacement ?? gap ?? reviews[0]!).type;
    const onlyGaps = reviews.every((r) => r.type === "extraction_gap");
    work.push({
      key: `filing:${versionId}`,
      stage: "yours",
      kind: onlyGaps ? "values" : "filing",
      title:
        type === "version_conflict"
          ? "Possible replacement"
          : onlyGaps && gap?.attribute
            ? attributeName(gap.attribute).split(" · ").at(-1)!
            : attentionKind(type),
      subject: `${segment ? `${documentName(segment.docType)} · ` : ""}${filename(versionId)}`,
      issue:
        replacement && others.length
          ? `Same type, parties and date as ${[...new Set(others)].join(", ")}`
          : onlyGaps
            ? `${reviews.length === 1 ? "No value read" : `${reviews.length} values not read`}`
            : reviews[0]!.reason,
      turn: "You",
      href:
        onlyGaps && gap?.segmentId
          ? `${base}/documents/${versionId}/values/${gap.segmentId}?from=overview`
          : `${base}/documents/${versionId}`,
      action: onlyGaps ? "Enter value" : "Review filing",
      view: onlyGaps ? "View values" : "View filing",
      order: onlyGaps ? 1 : 2,
    });
  }
  for (const f of open.filter((x) => !blockers.includes(x) && !informational.includes(x)))
    work.push(
      findingItem(f, stageOf(built.rules.get(f.ruleId)) === "later_lender" ? "lender" : "waiting"),
    );
  for (const f of informational) {
    const item = findingItem(f, "info");
    work.push({
      ...item,
      issue: "Context for the file; nothing is requested",
      href: `${base}/review?show=info&finding=${encodeURIComponent(f.findingKey)}`,
      action: "See finding",
    });
  }
  const strip = requiredPreparationRows(built.index, built.rules).map((r) => r.status);

  const counts: DealCounts = {
    required: { done: ready.satisfied + ready.waived, applicable: ready.applicable },
    notApplicable: byStatus.not_applicable ?? 0,
    byStatus,
    findingsOpen: open.length,
    findingsTotal: built.findings.length,
    blockers: blockers.length,
    informational: informational.length,
    arrivals: arrivals.length,
    filed: built.segments.length,
    documentsNeedingAttention: new Set([
      ...failedFiles.map((r) => r.version.id),
      ...openReviews.map((r) => r.documentVersionId),
      ...[...segmentsPending].map(
        (id) => built.segments.find((s) => s.id === id)?.documentVersionId ?? id,
      ),
    ]).size,
    pendingValues: pendingFacts.length,
    followUpsToPrepare: toPrepare.length,
    drafts: new Set(toPrepare.map(recipientOf)).size,
    requestsRecorded: requests.filter((r) => r.status === "sent").length,
    oldestRequestDays: outstanding.length ? ageInDays(outstanding[0]!.sentAt) : null,
    versions: snapshots.length,
  };
  return {
    ...built,
    counts,
    work: work.sort(
      (a, b) =>
        STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) ||
        a.order - b.order ||
        a.title.localeCompare(b.title) ||
        a.subject.localeCompare(b.subject),
    ),
    /** Status of each row in the preparation count, in index order, for the completeness strip. */
    strip,
    arrivals,
    failedFiles,
    openReviews,
    pendingFacts,
    sourceFacts,
    requests,
    snapshots,
    failedRuns: runs.filter((r) => r.configJson.dealId === dealId),
    party,
  };
}

/** Requirements grouped the way an operator reads them. */
export function requirementGroups(
  index: IndexRow[],
  rules: Map<string, { scope: string; checks: { type: string }[] }>,
) {
  const group = (r: IndexRow) => {
    const rule = rules.get(r.item_id);
    if (!rule) return r.party;
    if (rule.checks.some((c) => c.type === "tracking")) return "Lender-ordered work";
    if (rule.scope === "buyer_entity") return "Buyer entity";
    if (rule.scope === "target_business") return "Target business";
    if (rule.scope === "deal") return "Transaction";
    return r.party;
  };
  const order = ["Transaction", "Buyer entity", "Target business", "Lender-ordered work"];
  const names = [...new Set(index.map(group))].sort(
    (a, b) =>
      (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) -
        (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b),
  );
  return names.map((name) => ({ name, rows: index.filter((r) => group(r) === name) }));
}
