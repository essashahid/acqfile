import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { loadPack } from "@/lib/rules/loader";
import type { ResolvedPack, Rule } from "@/lib/rules/schema";
import { ACCEPTED, latestEvaluation } from "@/lib/evaluation/run";

export const footer = (pack: ResolvedPack) =>
  `Prepared from documents supplied by the parties. Flags are preparation aids for lender review. They are not credit, legal, tax or eligibility determinations. Rule pack: ${pack.pack} ${pack.version}. Rules marked unverified have not been confirmed by a lender.`;

/** Folder for a row, from the resolved pack's own folder list, so an overlay changes it with no code change. */
export function folderFor(rule: Rule | undefined, pack: ResolvedPack): string {
  const f = pack.index.folders;
  if (!rule) return f[0]!;
  if (rule.checks.some((c) => c.type === "tracking")) return f[4]!;
  switch (rule.scope) {
    case "buyer_entity":
      return f[1]!;
    case "target_business":
      return f[3]!;
    case "per_guarantor":
    case "per_owner_or_guarantor":
    case "per_affiliate":
    case "per_equity_source":
    case "per_paid_agent":
      return f[2]!;
    default:
      return f[0]!;
  }
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "none";

/** Package filename from the resolved pack's template (A3). */
export function packageFilename(
  pack: ResolvedPack,
  parts: {
    item_id: string;
    doc_label: string;
    party: string;
    period: string;
    original_extension: string;
  },
) {
  return pack.index.filename_template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key === "original_extension"
      ? parts.original_extension
      : clean(String(parts[key as keyof typeof parts] ?? "")),
  );
}

export type IndexRow = {
  item_id: string;
  item: string;
  party: string;
  period: string;
  status: string;
  package_paths: string[];
  original_filenames: string[];
  file_hashes: string[];
  document_date: string;
  open_findings: number;
  rule_verified: "unverified";
  checks: { type: string; result: string; message: string }[];
  segments: { id: string; versionId: string; page: number; label: string }[];
  scope_key: string;
  folder: string;
};
export type SourceRow = {
  fact_id: string;
  subject: string;
  attribute: string;
  value: string;
  period: string;
  original_filename: string;
  package_path: string;
  page: number;
  quote: string;
  method: string;
  confidence: number;
  review_status: string;
  reviewer: string;
  reviewed_at: string;
  file_hash: string;
};

/** The index every screen and the package share: checklist rows with their documents, package paths and open findings. */
export async function buildIndex(dealId: string) {
  const db = getDb();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw Error("Deal not found");
  const pack = loadPack(deal.rulePackVersion, deal.overlayId ?? undefined);
  const rules = new Map([...pack.items, ...pack.consistency].map((r) => [r.id, r]));
  const evaluation = await latestEvaluation(dealId);
  const [rows, findings, parties, segments, facts, versions, arrivals] = await Promise.all([
    evaluation
      ? db
          .select()
          .from(schema.checklistStatus)
          .where(eq(schema.checklistStatus.evaluationId, evaluation.id))
      : [],
    db.select().from(schema.findings).where(eq(schema.findings.dealId, dealId)),
    db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId)),
    db
      .select()
      .from(schema.segments)
      .where(
        and(
          eq(schema.segments.dealId, dealId),
          eq(schema.segments.isCurrent, true),
          eq(schema.segments.status, "confirmed"),
        ),
      ),
    db
      .select()
      .from(schema.facts)
      .where(
        and(
          eq(schema.facts.dealId, dealId),
          eq(schema.facts.isCurrent, true),
          inArray(schema.facts.routingStatus, [...ACCEPTED]),
        ),
      ),
    db.select().from(schema.documentVersions).where(eq(schema.documentVersions.dealId, dealId)),
    db
      .select({ arrival: schema.intakeFiles })
      .from(schema.intakeFiles)
      .innerJoin(
        schema.dealBatches,
        and(
          eq(schema.dealBatches.id, schema.intakeFiles.batchId),
          eq(schema.dealBatches.dealId, dealId),
        ),
      ),
  ]);
  const partyName = (id: string | null) => {
    const sources = deal.profileJson.equity_sources;
    const partyId = Array.isArray(sources) ? (sources.find((s) => s.id === id)?.party ?? id) : id;
    return (
      parties.find((p) => p.id === partyId)?.legalName ??
      (id === "deal" ? "Transaction" : "Unassigned")
    );
  };
  const scopeLabel = (key: string) =>
    key === "deal" ? "Transaction" : key === "none" ? "Not applicable" : partyName(key);
  const versionOf = (id: string) => versions.find((v) => v.id === id);
  const originalPath = (versionId: string) =>
    arrivals.find((a) => a.arrival.documentVersionId === versionId)?.arrival.originalPath ??
    versionOf(versionId)?.sourceFilename ??
    "unknown";
  const openByScope = new Map<string, number>();
  for (const f of findings.filter((f) => ["open", "requested"].includes(f.status)))
    openByScope.set(f.scopeKey, (openByScope.get(f.scopeKey) ?? 0) + 1);
  const paths = new Map<string, string>();
  const index: IndexRow[] = rows
    .map((r) => {
      const rule = rules.get(r.itemId);
      const folder = folderFor(rule, pack);
      const docs = r.satisfyingSegmentIds
        .map((id) => segments.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s);
      const rowPaths = docs.map((s) => {
        const version = versionOf(s.documentVersionId);
        const extension = version?.sourceFilename.match(/\.[A-Za-z0-9]+$/)?.[0] ?? ".pdf";
        let path = `${folder}/${packageFilename(pack, {
          item_id: r.itemId,
          doc_label: s.docType,
          party: partyName(s.partyId),
          period: s.period ?? "no-period",
          original_extension: extension,
        })}`;
        if (paths.has(path) && paths.get(path) !== s.documentVersionId)
          path =
            path.slice(0, -extension.length) + "_" + version!.contentHash.slice(0, 8) + extension;
        paths.set(path, s.documentVersionId);
        return path;
      });
      return {
        item_id: r.itemId,
        item: rule?.title ?? r.itemId,
        party: scopeLabel(r.scopeKey),
        period: r.period || "",
        status: r.status,
        package_paths: rowPaths,
        original_filenames: docs.map((s) => originalPath(s.documentVersionId)),
        file_hashes: docs.map((s) => versionOf(s.documentVersionId)!.contentHash),
        document_date:
          docs
            .map((s) => s.documentDate ?? "")
            .filter(Boolean)
            .sort()
            .at(-1) ?? "",
        open_findings: findings.filter(
          (f) =>
            f.ruleId === r.itemId &&
            f.scopeKey === r.scopeKey &&
            (f.period ?? "") === r.period &&
            ["open", "requested"].includes(f.status),
        ).length,
        rule_verified: "unverified" as const,
        checks: (r.reasonsJson as { type: string; result: string; message: string }[]) ?? [],
        segments: docs.map((s) => ({
          id: s.id,
          versionId: s.documentVersionId,
          page: s.pageStart,
          label: `${s.docType} · ${partyName(s.partyId)} · ${s.period ?? "no period"}`,
        })),
        scope_key: r.scopeKey,
        folder,
      };
    })
    .sort(
      (a, b) =>
        a.item_id.localeCompare(b.item_id) ||
        a.party.localeCompare(b.party) ||
        a.period.localeCompare(b.period),
    );
  const pathOfVersion = (versionId: string) => {
    for (const [path, id] of paths) if (id === versionId) return path;
    return "";
  };
  const allSegments = await db
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  for (const version of versions) {
    if (pathOfVersion(version.id)) continue;
    const history = allSegments.filter((s) => s.documentVersionId === version.id);
    if (history.length && !history.some((s) => s.isCurrent)) continue;
    const extension = version.sourceFilename.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "";
    const path = `Z_Unfiled_or_Not_Required/${packageFilename(pack, { item_id: "UNFILED", doc_label: clean(version.sourceFilename.replace(/\.[^.]+$/, "")), party: "unassigned", period: version.contentHash.slice(0, 8), original_extension: extension })}`;
    paths.set(path, version.id);
  }
  const sourceRecord: SourceRow[] = facts
    .filter((f) => segments.some((s) => s.id === f.segmentId))
    .map((f) => {
      const segment = segments.find((s) => s.id === f.segmentId);
      const locator = f.locatorJson as { page: number; quote: string; verbatim?: boolean };
      return {
        fact_id: f.id,
        subject: partyName(f.subjectPartyId),
        attribute: f.attribute,
        value: typeof f.valueJson === "string" ? f.valueJson : JSON.stringify(f.valueJson),
        period: f.period ?? "",
        original_filename: segment ? originalPath(segment.documentVersionId) : "",
        package_path: segment ? pathOfVersion(segment.documentVersionId) : "",
        page: locator.page,
        quote: locator.verbatim === false ? `[not verbatim] ${locator.quote}` : locator.quote,
        method: f.method,
        confidence: Number(f.confidence),
        review_status: f.routingStatus,
        reviewer: f.actorId ?? "",
        reviewed_at: f.actorId ? f.createdAt.toISOString() : "",
        file_hash: segment ? (versionOf(segment.documentVersionId)?.contentHash ?? "") : "",
      };
    })
    .sort((a, b) => a.fact_id.localeCompare(b.fact_id));
  return {
    deal,
    pack,
    rules,
    evaluation,
    index,
    findings,
    parties,
    segments,
    facts,
    versions,
    sourceRecord,
    paths,
    partyName,
    originalPath,
  };
}

/** Readiness as counts, never a lone percentage (Section 15). */
export function readiness(index: IndexRow[], rules: Map<string, Rule>) {
  const required = index.filter(
    (r) => rules.get(r.item_id)?.required && r.status !== "not_applicable",
  );
  return {
    satisfied: required.filter((r) => ["satisfied", "waived"].includes(r.status)).length,
    applicable: required.length,
  };
}
