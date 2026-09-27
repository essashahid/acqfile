import { DecisionForm } from "@/components/staff/DecisionForm";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { requirementEvidence } from "@/lib/staff/evidence";
import { findingStopsPreparation, stageOf } from "@/lib/deliverables/readiness";
import { draftRecipient } from "@/lib/deliverables/requests";
import {
  documentName,
  factValue,
  findingHeadline,
  attributeName,
  responsibleName,
  reviewSubject,
} from "@/lib/staff/labels";
import {
  PRIORITY,
  PRIORITY_HELP,
  actionHref,
  checksFromMessage,
  explainItem,
  profileDependencies,
} from "@/lib/staff/explain";
import { comparisonSentence, comparisonSides, valueGroups, type Detail } from "@/lib/staff/compare";
import { decisionAction } from "../../deliverable-actions";
import { AutoFilter } from "../../AutoFilter";
import { Card, Empty, PageHead } from "@/components/staff";

const CLOSED = ["resolved", "dismissed", "waived"];
type Stage = "blocks" | "waiting" | "lender";
const STAGE: Record<Stage, string> = {
  blocks: "Blocks the file",
  waiting: "Holds up preparation",
  lender: "Later lender work",
};
const SEVERITY = { blocker: 0, major: 1, minor: 2 } as Record<string, number>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date | null | undefined) =>
  d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "";

export default async function Review({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{
    finding?: string;
    show?: string;
    severity?: string;
    responsible?: string;
    from?: string;
  }>;
}) {
  const { dealId } = await params;
  const q = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const editable = mutationAllowed(ctx);
  const base = `/staff/deals/${dealId}`;
  const show = q.show === "history" ? "history" : q.show === "info" ? "info" : "open";
  const from = q.from === "overview" ? "overview" : undefined;
  const stageOfFinding = (f: (typeof v.findings)[number]): Stage =>
    stageOf(v.rules.get(f.ruleId)) === "later_lender"
      ? "lender"
      : f.severity === "blocker"
        ? "blocks"
        : "waiting";
  const title = (f: (typeof v.findings)[number]) =>
    reviewSubject(v.rules.get(f.ruleId)?.title ?? "") ||
    findingHeadline(f.type, (f.detailsJson as { message: string }).message);
  const turn = (f: (typeof v.findings)[number]) =>
    responsibleName(draftRecipient(f, v.rules.get(f.ruleId), v.partyName).split("·")[0]!);
  const list = v.findings
    .filter((f) =>
      show === "history"
        ? CLOSED.includes(f.status)
        : !CLOSED.includes(f.status) &&
          (show === "info"
            ? f.type === "info" || f.severity === "info"
            : f.type !== "info" && f.severity !== "info"),
    )
    .filter((f) => !q.severity || f.severity === q.severity)
    .filter((f) => !q.responsible || f.responsibleRole === q.responsible)
    .sort((a, b) =>
      show === "open"
        ? Object.keys(STAGE).indexOf(stageOfFinding(a)) -
            Object.keys(STAGE).indexOf(stageOfFinding(b)) ||
          (SEVERITY[a.severity] ?? 3) - (SEVERITY[b.severity] ?? 3) ||
          title(a).localeCompare(title(b)) ||
          v.party(a.scopeKey).localeCompare(v.party(b.scopeKey))
        : Number(b.severity === "blocker") - Number(a.severity === "blocker") ||
          a.ruleId.localeCompare(b.ruleId) ||
          (a.period ?? "").localeCompare(b.period ?? ""),
    );
  const selected = list.find((f) => f.findingKey === q.finding) ?? list[0];
  const at = selected ? list.indexOf(selected) : -1;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries({
      show,
      severity: q.severity,
      responsible: q.responsible,
      from,
      ...extra,
    }))
      if (val && !(k === "show" && val === "open")) p.set(k, val);
    return `?${p.toString()}`;
  };
  const d = selected
    ? ((selected.detailsJson as { message: string; details: Detail[] }) ?? {
        message: "",
        details: [],
      })
    : null;
  const closedCount = v.findings.filter((f) => CLOSED.includes(f.status)).length;

  // Everything below describes the selected item only.
  const rule = selected ? v.rules.get(selected.ruleId) : undefined;
  const row = selected
    ? v.index.find(
        (r) =>
          r.item_id === selected.ruleId &&
          r.scope_key === selected.scopeKey &&
          (r.period || null) === selected.period,
      )
    : undefined;
  const rowKey = row ? `${row.item_id}|${row.scope_key}|${row.period}` : undefined;
  const closed = selected ? CLOSED.includes(selected.status) : false;
  const attestations =
    selected && rule
      ? await getDb()
          .select()
          .from(schema.attestations)
          .where(eq(schema.attestations.dealId, dealId))
          .then((all) =>
            all.filter(
              (a) =>
                a.ruleId === selected.ruleId &&
                a.scopeKey === selected.scopeKey &&
                (a.period ?? "") === (selected.period ?? ""),
            ),
          )
      : [];
  // A closed item is described as it was recorded, never with today's check results.
  const ex =
    selected && rule && d
      ? explainItem({
          rule,
          status: closed
            ? selected.type === "missing"
              ? "missing"
              : "needs_review"
            : (row?.status ?? "needs_review"),
          checks: closed || !row ? checksFromMessage(rule, d.message) : row.checks,
          findingType: selected.type,
          findingMessage: d.message,
          parameters: v.pack.parameters,
          saved: closed ? [] : attestations.map((a) => ({ ...a, key: a.key ?? "" })),
        })
      : null;
  const stops = selected && !closed ? findingStopsPreparation(selected, rule) : false;
  const sourceLink = (versionId: string, page: number | null) =>
    `${base}/documents/${versionId}?page=${page ?? 1}&finding=${encodeURIComponent(selected!.findingKey)}&from=review&returnTo=${encodeURIComponent(`${base}/review${keep({ finding: selected!.findingKey })}`)}`;
  // Values the check cited, with the value recorded on the item rather than today's value.
  const facts = (d?.details ?? [])
    .filter((x) => x.fact_id !== null)
    .filter(
      (x, i, all) =>
        all.findIndex(
          (y) => y.fact_id === x.fact_id && JSON.stringify(y.value) === JSON.stringify(x.value),
        ) === i,
    );
  const metadata = (d?.details ?? []).filter((x) => x.fact_id === null && x.page !== null);
  const onFile =
    row && !closed
      ? requirementEvidence(v, row)
      : metadata.map((m) => ({ id: `${m.file}:${m.page}`, versionId: m.file, page: m.page! }));
  const firstFact = facts
    .map((x) => v.sourceFacts.find((f) => f.id === x.fact_id))
    .find((f) => f && v.segments.some((s) => s.id === f.segmentId));
  const firstFactSegment = firstFact
    ? v.segments.find((s) => s.id === firstFact.segmentId)
    : undefined;
  const firstDoc = onFile[0];
  const href =
    ex && !closed
      ? actionHref(ex.action.kind, base, {
          rowKey,
          noteKey: ex.action.noteKey,
          findingKey: selected?.findingKey,
          document: firstFactSegment
            ? {
                versionId: firstFactSegment.documentVersionId,
                page: firstFactSegment.pageStart,
                segmentId: firstFactSegment.id,
              }
            : firstDoc
              ? {
                  versionId: firstDoc.versionId,
                  page: firstDoc.page,
                  segmentId: v.segments.find((s) => s.id === firstDoc.id)?.id,
                }
              : undefined,
        })
      : null;
  const recordOnly = ex ? ["manual", "tracking"].includes(ex.family) : false;
  const dependencies = profileDependencies(rule);
  const sides =
    ex && ["disagreement", "relationship"].includes(ex.family) && d
      ? comparisonSides(rule, d.details ?? [], {
          segments: v.segments,
          facts: v.sourceFacts,
          versions: v.versions,
          parameters: v.pack.parameters,
        })
      : [];
  const sentence = comparisonSentence(sides);
  // Several documents reading one field: one card per value, listing the documents that give it.
  const grouped =
    sides.length > 2 &&
    sides.every((x) => x.source === "document") &&
    new Set(sides.map((x) => x.field)).size === 1
      ? valueGroups(sides)
      : null;
  const docName = (versionId: string, page: number | null) =>
    documentName(
      v.segments.find(
        (x) =>
          x.documentVersionId === versionId &&
          page !== null &&
          x.pageStart <= page &&
          x.pageEnd >= page,
      )?.docType ?? "",
    ) || "Supplied document";
  const request = selected?.requestId ? v.requests.find((r) => r.id === selected.requestId) : null;

  const pick = (f: (typeof list)[number]) => (
    <Link
      key={f.findingKey}
      href={keep({ finding: f.findingKey })}
      scroll={false}
      className={`pick ${selected?.findingKey === f.findingKey ? "is-active" : ""}`}
      aria-current={selected?.findingKey === f.findingKey ? "true" : undefined}
    >
      <span className={`mk mk-${show === "open" ? stageOfFinding(f) : "info"}`} aria-hidden />
      <span className="pick-title">{title(f)}</span>
      <span className="pick-turn">{show === "open" ? turn(f) : null}</span>
      <span className="pick-sub">
        {v.party(f.scopeKey)}
        {f.period ? ` · ${f.period}` : ""}
        {" · "}
        {CLOSED.includes(f.status) ? f.status : typeLabel(f.type)}
      </span>
    </Link>
  );

  return (
    <>
      <PageHead
        title="Review"
        actions={
          <nav className="seg" aria-label="Show">
            <Link
              href={keep({ show: "open", finding: undefined })}
              aria-current={show === "open" ? "page" : undefined}
            >
              Open <span className="num">{v.counts.findingsOpen - v.counts.informational}</span>
            </Link>
            <Link
              href={keep({ show: "history", finding: undefined })}
              aria-current={show === "history" ? "page" : undefined}
            >
              History <span className="num">{closedCount}</span>
            </Link>
            <Link
              href={keep({ show: "info", finding: undefined })}
              aria-current={show === "info" ? "page" : undefined}
            >
              For information <span className="num">{v.counts.informational}</span>
            </Link>
          </nav>
        }
      />
      {!v.preparation.current ? (
        <p className="meta mb-3" role="note">
          These results are from the last check. Newer evidence is waiting to be checked.
        </p>
      ) : null}

      {list.length || q.severity || q.responsible ? (
        <div className="review-split">
          <nav className="card review-list" aria-label="Items">
            <AutoFilter className="review-filters">
              <input type="hidden" name="show" value={show} />
              {from ? <input type="hidden" name="from" value={from} /> : null}
              <select
                name="responsible"
                defaultValue={q.responsible ?? ""}
                aria-label="Responsible"
              >
                <option value="">All parties</option>
                {[...new Set(v.findings.map((f) => f.responsibleRole))].sort().map((s) => (
                  <option key={s} value={s}>
                    {responsibleName(s)}
                  </option>
                ))}
              </select>
              <select
                name="severity"
                defaultValue={q.severity ?? ""}
                aria-label="Priority"
                title={PRIORITY_HELP}
              >
                <option value="">All priorities</option>
                {[...new Set(v.findings.map((f) => f.severity))].sort().map((s) => (
                  <option key={s} value={s}>
                    {PRIORITY[s] ?? s}
                  </option>
                ))}
              </select>
            </AutoFilter>
            <div className="review-items">
              {show === "open"
                ? (Object.keys(STAGE) as Stage[]).map((stage) => {
                    const items = list.filter((f) => stageOfFinding(f) === stage);
                    if (!items.length) return null;
                    return (
                      <div key={stage} role="group" aria-label={STAGE[stage]}>
                        <p className="pick-group">
                          <span className={`mk mk-${stage}`} aria-hidden />
                          {STAGE[stage]} <span className="num">{items.length}</span>
                        </p>
                        {items.map(pick)}
                      </div>
                    );
                  })
                : list.map(pick)}
              {!list.length ? (
                <p className="meta px-4 py-3">No items match these filters.</p>
              ) : null}
            </div>
          </nav>

          {selected && d ? (
            // Keyed by item so unsaved notes never carry over to another selection.
            <article className="card review-detail" key={selected.findingKey}>
              <div className="detail-nav">
                {from === "overview" ? (
                  <Link className="q-link" href={base}>
                    <ArrowLeft size={14} aria-hidden />
                    Back to Next up
                  </Link>
                ) : null}
                <span className="meta ml-auto">
                  {at + 1} of {list.length}
                </span>
                {at > 0 ? (
                  <Link
                    className="btn btn-sm"
                    href={keep({ finding: list[at - 1]!.findingKey })}
                    scroll={false}
                    aria-label={`Previous: ${title(list[at - 1]!)}`}
                  >
                    <ChevronLeft size={15} aria-hidden />
                  </Link>
                ) : null}
                {at < list.length - 1 ? (
                  <Link
                    className="btn btn-sm"
                    href={keep({ finding: list[at + 1]!.findingKey })}
                    scroll={false}
                    aria-label={`Next: ${title(list[at + 1]!)}`}
                  >
                    Next
                    <ChevronRight size={15} aria-hidden />
                  </Link>
                ) : null}
              </div>

              <div className="detail-body">
                <header className="space-y-1">
                  <p className={`detail-status ${closed ? "" : `is-${stageOfFinding(selected)}`}`}>
                    <span
                      className={`mk mk-${closed ? "info" : stageOfFinding(selected)}`}
                      aria-hidden
                    />
                    {closed
                      ? `${selected.status.charAt(0).toUpperCase()}${selected.status.slice(1)}`
                      : STAGE[stageOfFinding(selected)]}
                  </p>
                  <h2 className="detail-title">{title(selected)}</h2>
                  <p className="meta">
                    {v.party(selected.scopeKey)}
                    {selected.period ? ` · ${selected.period}` : ""} · Responsible:{" "}
                    {responsibleName(selected.responsibleRole)} ·{" "}
                    <span title={PRIORITY_HELP}>
                      {PRIORITY[selected.severity] ?? selected.severity}
                    </span>
                  </p>
                </header>

                {closed ? (
                  <p>
                    This item was {selected.status}.{" "}
                    {ex?.summary ? `When it was open: ${ex.summary}` : ""}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="detail-issue">{sentence || ex?.summary || d.message}</p>
                    {ex?.open[0]?.saved ? <p className="meta">{ex.open[0].saved}</p> : null}
                    {ex?.note ? <p className="meta">{ex.note}</p> : null}
                    {ex?.open.slice(1).map((l, i) => (
                      <p key={i} className="meta">
                        Also: {l.text}
                      </p>
                    ))}
                  </div>
                )}
                {selected.reason ? (
                  <p className="meta">
                    <span className="eyebrow">Recorded reason</span> {selected.reason}
                  </p>
                ) : null}

                {sides.length ? (
                  <div className="compare" role="group" aria-label="Values compared">
                    {grouped
                      ? grouped.map((g, i) => (
                          <section key={i} className="side">
                            <p className="eyebrow">{g.names}</p>
                            <p className="side-value">{g.value}</p>
                            {g.sides[0]!.quote ? (
                              <blockquote>“{g.sides[0]!.quote}”</blockquote>
                            ) : null}
                            <ul className="side-sources">
                              {g.sides.map((x, j) => (
                                <li key={j}>
                                  {x.versionId ? (
                                    <Link
                                      className="link"
                                      href={sourceLink(x.versionId, x.page ?? 1)}
                                    >
                                      {x.filename ?? x.label}
                                    </Link>
                                  ) : (
                                    <span>{x.filename ?? x.label}</span>
                                  )}
                                  <span className="meta">
                                    {" "}
                                    · {x.label.toLowerCase()} · page {x.page}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))
                      : sides.map((s, i) => (
                          <section key={i} className="side">
                            <p className="eyebrow">
                              {s.source === "limit"
                                ? "Configured in the rule pack"
                                : `${s.label}${s.page ? ` · page ${s.page}` : ""}`}
                            </p>
                            <p className="side-value">
                              {s.source === "document" && sides.some((x) => x.field !== s.field)
                                ? `${s.field}: ${s.value}`
                                : s.value}
                            </p>
                            {s.quote ? <blockquote>“{s.quote}”</blockquote> : null}
                            <p className="meta">
                              {s.source === "profile"
                                ? "Declared by the operator"
                                : s.source === "limit"
                                  ? `${s.field}, unverified`
                                  : [s.filename, s.signed].filter(Boolean).join(" · ")}
                            </p>
                            {s.source === "profile" ? (
                              <Link className="link side-link" href={`${base}/profile`}>
                                Open profile
                              </Link>
                            ) : s.versionId ? (
                              <Link
                                className="link side-link"
                                href={sourceLink(s.versionId, s.page ?? 1)}
                              >
                                View page {s.page}
                              </Link>
                            ) : null}
                          </section>
                        ))}
                  </div>
                ) : recordOnly || ex?.family === "missing" || ex?.family === "proposed" ? (
                  <section className="detail-block">
                    <h3>Documents on file</h3>
                    {ex?.family === "tracking" ? (
                      <p className="meta">
                        The lender supplies this. No borrower document is requested.
                      </p>
                    ) : ex?.family === "manual" ? (
                      <p className="meta">
                        On file for this requirement. They do not show that the open check was done;
                        record it with the check itself.
                      </p>
                    ) : null}
                    {onFile.length ? (
                      <ul className="mt-2 space-y-1">
                        {onFile.map((s) => (
                          <li key={s.id}>
                            <Link className="link" href={sourceLink(s.versionId, s.page)}>
                              View {docName(s.versionId, s.page)}
                            </Link>
                            <span className="meta"> · page {s.page}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>
                        {ex?.family === "missing"
                          ? "Nothing accepted is on file for this requirement yet."
                          : "No document is needed to answer this check."}
                      </Empty>
                    )}
                  </section>
                ) : (
                  <section className="detail-block">
                    <h3>Values the check used</h3>
                    {facts.length ? (
                      <ul className="values-used">
                        {facts.map((s, i) => {
                          const fact = v.sourceFacts.find((f) => f.id === s.fact_id);
                          return (
                            <li key={i}>
                              <p className="meta">
                                {fact ? attributeName(fact.attribute) : "Value"} ·{" "}
                                {fact?.method === "manual"
                                  ? "entered by staff"
                                  : "read from the document"}
                              </p>
                              <p className="font-semibold">
                                {factValue(fact?.attribute ?? "", fact?.unit ?? "text", s.value)}
                              </p>
                              {s.quote ? <blockquote>“{s.quote}”</blockquote> : null}
                              {v.versions.some((x) => x.id === s.file) ? (
                                <Link className="link" href={sourceLink(s.file, s.page)}>
                                  View {docName(s.file, s.page)}, page {s.page}
                                </Link>
                              ) : (
                                <span className="meta">Source not on file</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : ex?.family === "document" && metadata.length ? (
                      <ul className="values-used">
                        {metadata.map((m, i) => (
                          <li key={i}>
                            <p className="meta">Document details as filed</p>
                            <p className="font-semibold">{factValue("", "text", m.value)}</p>
                            <blockquote>“{m.quote}”</blockquote>
                            <Link className="link" href={sourceLink(m.file, m.page)}>
                              View document, page {m.page}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>
                        {ex?.open.length
                          ? "The value this check needs has not been read yet."
                          : "No cited evidence."}
                      </Empty>
                    )}
                  </section>
                )}
                {dependencies.length && !sides.some((s) => s.source === "profile") ? (
                  <p className="meta">
                    Also compared with the deal profile: {dependencies.join(", ")}.{" "}
                    <Link className="link" href={`${base}/profile`}>
                      Open profile
                    </Link>
                  </p>
                ) : null}

                {!closed ? (
                  <section className="resolve" aria-label="Resolve">
                    <div className="flex flex-wrap items-center gap-2">
                      {editable && href && ex?.action.label ? (
                        <Link className="btn btn-primary" href={href}>
                          {ex.action.label}
                        </Link>
                      ) : null}
                      {editable && sides.some((s) => s.source === "profile") ? (
                        <Link className="btn" href={`${base}/profile?edit=1#edit`}>
                          Correct profile
                        </Link>
                      ) : null}
                      {!editable && href ? (
                        <Link className="btn" href={href}>
                          View evidence
                        </Link>
                      ) : null}
                      {rowKey ? (
                        <Link
                          className="link ml-1"
                          href={`${base}/requirements?show=all&focus=${encodeURIComponent(rowKey)}#${encodeURIComponent(rowKey)}`}
                        >
                          Requirement: {row!.item}
                        </Link>
                      ) : null}
                    </div>
                    {editable ? (
                      <details className="decide">
                        <summary>Dismiss or waive, with a reason</summary>
                        <p className="meta mt-2">
                          Dismiss closes this item; the requirement still counts until met or waived
                          {stops ? ", so it still stops the file from being prepared" : ""}. Waive
                          counts as waived, not satisfied, and is not lender approval. Both are
                          recorded with your name and change no evidence.
                        </p>
                        <DecisionForm
                          action={decisionAction.bind(null, dealId)}
                          className="mt-3 flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="finding_key" value={selected.findingKey} />
                          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
                            <span className="eyebrow">Reason (required)</span>
                            <input name="reason" aria-label="Decision reason" required />
                          </label>
                          <button className="btn" name="action" value="dismiss">
                            Dismiss finding
                          </button>
                          <button className="btn" name="action" value="waive">
                            Waive requirement
                          </button>
                        </DecisionForm>
                      </details>
                    ) : null}
                  </section>
                ) : null}

                <p className="detail-foot">
                  {request
                    ? `Follow-up recorded as sent ${day(request.sentAt)}`
                    : selected.status === "requested"
                      ? "Follow-up recorded as sent"
                      : "Not yet requested"}
                </p>

                <details className="reveal">
                  <summary>Technical detail</summary>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    <div>
                      <dt className="eyebrow">Rule</dt>
                      <dd className="font-mono text-[13px]">{selected.ruleId}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Finding key</dt>
                      <dd className="break-words font-mono text-[13px]">{selected.findingKey}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Scope key</dt>
                      <dd className="break-words font-mono text-[13px]">{selected.scopeKey}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Stored values</dt>
                      <dd className="text-[13px]">
                        type {selected.type} · severity {selected.severity} · status{" "}
                        {selected.status}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="eyebrow">Raw check result</dt>
                      <dd className="text-[13px]">{d.message}</dd>
                    </div>
                  </dl>
                  <details className="reveal mt-4">
                    <summary>All recorded evidence and rule inputs</summary>
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap text-sm">
                      {JSON.stringify(d.details, null, 2)}
                    </pre>
                  </details>
                </details>
              </div>
            </article>
          ) : null}
        </div>
      ) : (
        <Card>
          <Empty>
            {show === "open" ? "No open items match these filters." : "No closed items yet."}
          </Empty>
        </Card>
      )}
    </>
  );
}

const TYPE_LABEL: Record<string, string> = {
  conflict: "sources disagree",
  missing: "missing",
  needs_review: "needs review",
  incomplete: "incomplete",
  stale: "out of date",
  info: "for information",
};
const typeLabel = (type: string) => TYPE_LABEL[type] ?? type.replaceAll("_", " ");
