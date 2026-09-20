import { buildIndex, readiness } from "@/lib/deliverables/index-build";
import { listRequests, ageInDays } from "@/lib/deliverables/requests";
import { DeliverableNav } from "./DeliverableNav";
import { retryFileAction } from "../deliverable-actions";
import Link from "next/link";
import { DealDocuments } from "./Documents";
import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { readDeal, dealDraft } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealCounts, PENDING } from "@/lib/evaluation/run";
import { inArray } from "drizzle-orm";
import { DealEditor } from "../DealEditor";
import { IntakeForm } from "../IntakeForm";
export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const { deal } = await readDeal(ctx, dealId);
  const segments = await getDb()
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  const counts = await dealCounts(dealId);
  const built = deal.rulePackVersion !== "unknown" ? await buildIndex(dealId) : null;
  const ready = built ? readiness(built.index, built.rules) : null;
  const requests = await listRequests(dealId);
  const outstanding = requests.filter((r) =>
    built?.findings.some((f) => r.findingKeys.includes(f.findingKey) && f.status === "requested"),
  );
  const oldest = outstanding[0];
  const parties = await getDb()
    .select()
    .from(schema.parties)
    .where(eq(schema.parties.dealId, dealId));
  const pendingFacts = await getDb()
    .select({ segmentId: schema.facts.segmentId })
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.isCurrent, true),
        inArray(schema.facts.routingStatus, [...PENDING]),
      ),
    );
  const openGaps = await getDb()
    .select({ segmentId: schema.intakeReviews.segmentId })
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.dealId, dealId),
        eq(schema.intakeReviews.status, "open"),
        inArray(schema.intakeReviews.type, ["extraction_gap", "identifier_mismatch"]),
      ),
    );
  const pendingBySegment = new Map<string, number>();
  for (const row of [...pendingFacts, ...openGaps])
    if (row.segmentId)
      pendingBySegment.set(row.segmentId, (pendingBySegment.get(row.segmentId) ?? 0) + 1);
  const reviewSegments = segments.filter((s) => s.isCurrent && pendingBySegment.has(s.id));
  const rows = await getDb()
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
    .orderBy(desc(schema.dealBatches.number));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {deal.code} · {deal.name}
      </h1>
      <DeliverableNav dealId={dealId} />
      <section aria-label="Readiness">
        <h2>Readiness</h2>
        <p>
          {ready
            ? `${ready.satisfied} of ${ready.applicable} applicable required rows satisfied or waived`
            : "Rule pack not selected"}
        </p>
        <h3>Blockers</h3>
        {built?.findings
          .filter((f) => f.severity === "blocker" && ["open", "requested"].includes(f.status))
          .map((f) => (
            <p key={f.id}>
              {f.ruleId} · {(f.detailsJson as { message: string }).message}
            </p>
          ))}
        <p>
          Oldest outstanding request:{" "}
          {oldest ? `${oldest.responsible} · ${ageInDays(oldest.sentAt)} days` : "none"}
        </p>
      </section>
      <p>
        Rule pack: {deal.rulePackVersion} · Overlay: {deal.overlayId ?? "Base"} · Rules unverified
      </p>
      {mutationAllowed(ctx) && (
        <>
          <details>
            <summary>Edit profile, parties and ownership</summary>
            <DealEditor
              initial={await dealDraft(ctx, dealId)}
              id={dealId}
              revision={deal.revision}
            />
          </details>
          <IntakeForm dealId={dealId} />
        </>
      )}
      <section aria-label="Evaluation counts" className="rounded border p-3 text-sm">
        <h2 className="text-xl font-semibold">Evaluation</h2>
        <p>
          Checklist:{" "}
          {Object.entries(counts.checklist)
            .sort()
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ") || "not evaluated"}
        </p>
        <p>
          Findings: <span data-testid="findings-total">{counts.findingsTotal}</span> (
          {Object.entries(counts.findings)
            .sort()
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ") || "none"}
          )
        </p>
        <p>
          By type:{" "}
          {["missing", "stale", "incomplete", "conflict", "needs_review", "info"].map((t) => (
            <span key={t} className="mr-3">
              {t} <span data-testid={`findings-${t}`}>{counts.findingsByType[t] ?? 0}</span>
            </span>
          ))}
        </p>
        <p>
          Pending values: <span data-testid="pending-values">{counts.pendingFacts}</span> · open
          review items: <span data-testid="open-reviews">{counts.openReviews}</span>
          {counts.evaluatedAt ? ` · evaluated ${counts.evaluatedAt.toISOString()}` : ""}
        </p>
      </section>
      <h2 className="text-xl font-semibold">Fact review</h2>
      <ul className="divide-y text-sm">
        {reviewSegments.map((s) => (
          <li key={s.id} className="py-2">
            <Link className="underline" href={`/staff/deals/${dealId}/segments/${s.id}/review`}>
              {s.docType} · {parties.find((p) => p.id === s.partyId)?.legalName ?? "No party"} ·{" "}
              {s.period ?? "No period"}
            </Link>
            <span className="ml-3">{pendingBySegment.get(s.id)} pending</span>
          </li>
        ))}
      </ul>
      {!reviewSegments.length && <p className="text-sm">No values await review.</p>}
      <h2>Files needing retry</h2>
      {rows
        .filter(
          (r) =>
            r.version.parseStatus === "failed" ||
            ["failed", "dead_letter"].includes(r.version.processingStatus),
        )
        .map((r) => (
          <div key={r.arrival.id}>
            {r.arrival.originalPath}
            {mutationAllowed(ctx) && (
              <form action={retryFileAction.bind(null, dealId, r.version.id)}>
                <button>Retry file</button>
              </form>
            )}
          </div>
        ))}
      <h2 className="text-xl font-semibold">Intake</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Batch</th>
            <th>Original path</th>
            <th>SHA-256</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.arrival.id} className="border-b">
              <td>{r.batch}</td>
              <td className="py-3">
                <Link className="underline" href={`/staff/deals/${dealId}/files/${r.version.id}`}>
                  {r.arrival.originalPath}
                </Link>
                <p className="text-xs">
                  {segments
                    .filter((s) => s.documentVersionId === r.version.id)
                    .map(
                      (s) =>
                        `${s.docType} p${s.pageStart}–${s.pageEnd} · ${s.isCurrent ? s.status : "superseded"}`,
                    )
                    .join("; ")}
                </p>
              </td>
              <td title={r.arrival.contentHash} className="font-mono">
                {r.arrival.contentHash.slice(0, 12)}
              </td>
              <td>
                {r.arrival.duplicate
                  ? "Duplicate · linked to existing version"
                  : r.version.parseStatus === "failed"
                    ? "UNREADABLE · high priority review"
                    : r.version.parseStatus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DealDocuments
        dealId={dealId}
        pack={deal.rulePackVersion}
        overlay={deal.overlayId}
        editable={mutationAllowed(ctx)}
      />
    </div>
  );
}
