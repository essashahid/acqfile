import Link from "next/link";
import { and, eq, desc, inArray } from "drizzle-orm";
import { buildIndex, readiness } from "@/lib/deliverables/index-build";
import { listRequests, ageInDays } from "@/lib/deliverables/requests";
import { retryFileAction } from "../deliverable-actions";
import { DealDocuments } from "./Documents";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { readDeal, dealDraft } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealCounts, PENDING } from "@/lib/evaluation/run";
import { DealEditor } from "../DealEditor";
import { IntakeForm } from "../IntakeForm";
import { Card, DealTabs, Empty, PageHead, Pill, Stat, StatRow } from "@/components/staff";

export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const { deal } = await readDeal(ctx, dealId);
  const editable = mutationAllowed(ctx);
  const db = getDb();
  const segments = await db
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
  const blockers = (built?.findings ?? []).filter(
    (f) => f.severity === "blocker" && ["open", "requested"].includes(f.status),
  );
  const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
  const pendingFacts = await db
    .select({ segmentId: schema.facts.segmentId })
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.dealId, dealId),
        eq(schema.facts.isCurrent, true),
        inArray(schema.facts.routingStatus, [...PENDING]),
      ),
    );
  const openGaps = await db
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
  const rows = await db
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
  const failed = rows.filter(
    (r) =>
      r.version.parseStatus === "failed" ||
      ["failed", "dead_letter"].includes(r.version.processingStatus),
  );
  const partyName = (id: string | null) =>
    parties.find((p) => p.id === id)?.legalName ?? "No party";
  return (
    <>
      <PageHead
        eyebrow={deal.code}
        title={deal.name}
        subtitle={`Rule pack ${deal.rulePackVersion} · overlay ${deal.overlayId ?? "base"} · as of ${deal.asOfDate} · every rule unverified`}
      />
      <DealTabs dealId={dealId} current="overview" />

      <div className="space-y-5">
        <Card title="Readiness">
          <StatRow>
            <Stat
              label="Required rows"
              value={ready ? `${ready.satisfied} of ${ready.applicable}` : "—"}
              hint={ready ? "satisfied or waived" : "Rule pack not selected"}
            />
            <Stat
              label="Blockers"
              value={blockers.length}
              hint={blockers.length ? "must clear before the lender file" : "none outstanding"}
            />
            <Stat
              label="Open findings"
              value={counts.findingsTotal}
              testId="findings-total"
              hint={
                Object.entries(counts.findings)
                  .sort()
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ") || "none"
              }
            />
            <Stat
              label="Oldest request"
              value={oldest ? `${ageInDays(oldest.sentAt)} days` : "—"}
              hint={oldest ? oldest.responsible : "nothing outstanding"}
            />
          </StatRow>
          {blockers.length ? (
            <ul className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">
              {blockers.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Pill value={f.type} />
                  <Link className="link" href={`/staff/deals/${dealId}/findings`}>
                    {f.ruleId}
                  </Link>
                  <span className="meta">{(f.detailsJson as { message: string }).message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card
          title="Evaluation"
          description={
            counts.evaluatedAt
              ? `Last run ${counts.evaluatedAt.toISOString().replace("T", " ").slice(0, 16)}`
              : "Not evaluated yet"
          }
        >
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-2">Checklist</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(counts.checklist).length ? (
                  Object.entries(counts.checklist)
                    .sort()
                    .map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <Pill value={k} />
                        <span className="num font-semibold">{v}</span>
                      </span>
                    ))
                ) : (
                  <Empty>Not evaluated.</Empty>
                )}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">Findings by type</p>
              <div className="flex flex-wrap gap-2">
                {["missing", "stale", "incomplete", "conflict", "needs_review", "info"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Pill value={t} />
                    <span className="num font-semibold" data-testid={`findings-${t}`}>
                      {counts.findingsByType[t] ?? 0}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--line)] pt-3">
            <p className="meta">
              Pending values{" "}
              <span className="num font-semibold text-[var(--fg)]" data-testid="pending-values">
                {counts.pendingFacts}
              </span>
            </p>
            <p className="meta">
              Open review items{" "}
              <span className="num font-semibold text-[var(--fg)]" data-testid="open-reviews">
                {counts.openReviews}
              </span>
            </p>
          </div>
        </Card>

        <Card
          title="Fact review"
          description="Documents with values waiting on a person."
          flush={reviewSegments.length > 0}
        >
          {reviewSegments.length ? (
            <ul>
              {reviewSegments.map((s) => (
                <li
                  key={s.id}
                  className="rowline flex flex-wrap items-baseline justify-between gap-3"
                >
                  <Link className="link" href={`/staff/deals/${dealId}/segments/${s.id}/review`}>
                    {s.docType} · {partyName(s.partyId)} · {s.period ?? "no period"}
                  </Link>
                  <span className="pill pill-warn">{pendingBySegment.get(s.id)} pending</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No values await review.</Empty>
          )}
        </Card>

        {failed.length ? (
          <Card title="Files needing retry" flush>
            <ul>
              {failed.map((r) => (
                <li
                  key={r.arrival.id}
                  className="rowline flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{r.arrival.originalPath}</p>
                    <p className="meta">
                      Parse {r.version.parseStatus} · processing {r.version.processingStatus}
                    </p>
                  </div>
                  {editable ? (
                    <form action={retryFileAction.bind(null, dealId, r.version.id)}>
                      <button className="btn btn-sm">Retry file</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {editable ? (
          <Card title="Add documents">
            <IntakeForm dealId={dealId} />
          </Card>
        ) : null}

        <Card title="Intake" description={`${rows.length} arrivals across all batches.`} flush>
          {rows.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>File</th>
                  <th>SHA-256</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.arrival.id}>
                    <td className="num">{r.batch}</td>
                    <td>
                      <Link className="link" href={`/staff/deals/${dealId}/files/${r.version.id}`}>
                        {r.arrival.originalPath}
                      </Link>
                      <p className="meta">
                        {segments
                          .filter((s) => s.documentVersionId === r.version.id)
                          .map(
                            (s) =>
                              `${s.docType} p${s.pageStart}–${s.pageEnd} · ${s.isCurrent ? s.status : "superseded"}`,
                          )
                          .join("; ") || "No segments"}
                      </p>
                    </td>
                    <td className="num" title={r.arrival.contentHash}>
                      {r.arrival.contentHash.slice(0, 12)}
                    </td>
                    <td>
                      {r.arrival.duplicate ? (
                        <>
                          <Pill value="duplicate" />
                          <p className="meta mt-1">Linked to the existing version</p>
                        </>
                      ) : r.version.parseStatus === "failed" ? (
                        <>
                          <Pill value="failed" title="parse failed" />
                          <p className="meta mt-1">Unreadable · high priority</p>
                        </>
                      ) : (
                        <Pill value={r.version.parseStatus} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-5">
              <Empty>Nothing has arrived yet.</Empty>
            </div>
          )}
        </Card>

        <DealDocuments
          dealId={dealId}
          pack={deal.rulePackVersion}
          overlay={deal.overlayId}
          editable={editable}
        />

        {editable ? (
          <Card title="Deal profile" description="Parties, roles, ownership and transaction terms.">
            <details>
              <summary className="link cursor-pointer">Edit profile, parties and ownership</summary>
              <div className="mt-4">
                <DealEditor
                  initial={await dealDraft(ctx, dealId)}
                  id={dealId}
                  revision={deal.revision}
                />
              </div>
            </details>
          </Card>
        ) : null}
      </div>
    </>
  );
}
