import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { buildIndex, readiness, type IndexRow } from "@/lib/deliverables/index-build";
import { listRequests, ageInDays } from "@/lib/deliverables/requests";
import { listSnapshots } from "@/lib/deliverables/snapshot";
import { PENDING } from "@/lib/evaluation/run";
import { documentName, findingHeadline } from "./labels";

export type WorkItem = {
  key: string;
  /** blocker first, then work that needs another party, then information. */
  rank: number;
  kind: "blocker" | "unresolved" | "processing" | "review" | "follow-up" | "info";
  title: string;
  why: string;
  party: string;
  href: string;
  action: string;
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
  const [requests, snapshots, arrivals, openReviews, pendingFacts, runs] = await Promise.all([
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
      .where(and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open"))),
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
  ]);

  const ready = readiness(built.index, built.rules);
  const byStatus: Record<string, number> = {};
  for (const r of built.index) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const open = built.findings.filter((f) => ["open", "requested"].includes(f.status));
  const blockers = open.filter((f) => f.severity === "blocker");
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

  // Follow-ups still to prepare: open findings not yet covered by a recorded request.
  const recordedKeys = new Set(requests.flatMap((r) => r.findingKeys));
  const toPrepare = built.findings.filter(
    (f) => f.status === "open" && !recordedKeys.has(f.findingKey),
  );
  const outstanding = requests.filter((r) =>
    built.findings.some((f) => r.findingKeys.includes(f.findingKey) && f.status === "requested"),
  );

  const work: WorkItem[] = [];
  for (const f of blockers)
    work.push({
      key: `finding:${f.findingKey}`,
      rank: 0,
      kind: "blocker",
      title: findingHeadline(f.type, (f.detailsJson as { message: string }).message) || f.ruleId,
      why: "Blocks the lender file until it is resolved, dismissed or waived.",
      party: party(f.scopeKey) + (f.period ? ` · ${f.period}` : ""),
      href: `${base}/review?finding=${encodeURIComponent(f.findingKey)}`,
      action: "Review evidence",
    });
  for (const r of failedFiles)
    work.push({
      key: `file:${r.version.id}`,
      rank: 1,
      kind: "processing",
      title: `${r.arrival.originalPath.split("/").pop()} could not be processed`,
      why: "A file that cannot be read supplies no evidence, so any requirement it was meant to meet stays open.",
      party: "Intake",
      href: `${base}/documents?file=${r.version.id}`,
      action: "See options",
    });
  for (const f of open.filter((x) => x.severity !== "blocker" && !informational.includes(x)))
    work.push({
      key: `finding:${f.findingKey}`,
      rank: 2,
      kind: "unresolved",
      title: findingHeadline(f.type, (f.detailsJson as { message: string }).message) || f.ruleId,
      why: `${f.type.replaceAll("_", " ")} · responsible: ${f.responsibleRole}`,
      party: party(f.scopeKey) + (f.period ? ` · ${f.period}` : ""),
      href: `${base}/review?finding=${encodeURIComponent(f.findingKey)}`,
      action: "Review evidence",
    });
  const segmentsPending = new Set(pendingFacts.map((f) => f.segmentId));
  for (const id of segmentsPending) {
    const segment = built.segments.find((s) => s.id === id);
    if (!segment) continue;
    work.push({
      key: `segment:${id}`,
      rank: 3,
      kind: "review",
      title: `Confirm values read from ${documentName(segment.docType)}`,
      why: `${pendingFacts.filter((f) => f.segmentId === id).length} value(s) await a person.`,
      party: built.partyName(segment.partyId),
      href: `${base}/documents/${segment.documentVersionId}/values/${id}`,
      action: "Review values",
    });
  }
  if (toPrepare.length)
    work.push({
      key: "follow-ups",
      rank: 4,
      kind: "follow-up",
      title: `Prepare ${toPrepare.length} follow-up ${toPrepare.length === 1 ? "item" : "items"}`,
      why: "Nothing has been recorded as sent for these yet.",
      party: [...new Set(toPrepare.map((f) => f.responsibleRole))].join(", "),
      href: `${base}/follow-ups`,
      action: "Open follow-ups",
    });
  for (const f of informational)
    work.push({
      key: `finding:${f.findingKey}`,
      rank: 5,
      kind: "info",
      title: findingHeadline(f.type, (f.detailsJson as { message: string }).message) || f.ruleId,
      why: "Context for the file. The current rules do not require a document for this.",
      party: party(f.scopeKey) + (f.period ? ` · ${f.period}` : ""),
      href: `${base}/review?finding=${encodeURIComponent(f.findingKey)}`,
      action: "See finding",
    });

  const counts: DealCounts = {
    required: { done: ready.satisfied, applicable: ready.applicable },
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
    requestsRecorded: requests.filter((r) => r.status === "sent").length,
    oldestRequestDays: outstanding.length ? ageInDays(outstanding[0]!.sentAt) : null,
    versions: snapshots.length,
  };
  return {
    ...built,
    counts,
    work: work.sort((a, b) => a.rank - b.rank),
    arrivals,
    failedFiles,
    openReviews,
    pendingFacts,
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
    if (rule.checks.some((c) => c.type === "tracking")) return "Lender-ordered";
    if (rule.scope === "buyer_entity") return "Buyer entity";
    if (rule.scope === "target_business") return "Target business";
    if (rule.scope === "deal") return "Transaction";
    return r.party;
  };
  const order = ["Transaction", "Buyer entity", "Target business", "Lender-ordered"];
  const names = [...new Set(index.map(group))].sort(
    (a, b) =>
      (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) -
        (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b),
  );
  return names.map((name) => ({ name, rows: index.filter((r) => group(r) === name) }));
}
