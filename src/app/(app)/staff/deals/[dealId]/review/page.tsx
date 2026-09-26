import { DecisionForm } from "@/components/staff/DecisionForm";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { requirementEvidence } from "@/lib/staff/evidence";
import { findingStopsPreparation, stageOf } from "@/lib/deliverables/readiness";
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
  stageEffect,
} from "@/lib/staff/explain";
import { decisionAction } from "../../deliverable-actions";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

type Detail = {
  fact_id: string | null;
  value: unknown;
  file: string;
  page: number | null;
  quote: string;
};
const CLOSED = ["resolved", "dismissed", "waived"];

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
    .sort(
      (a, b) =>
        Number(b.severity === "blocker") - Number(a.severity === "blocker") ||
        a.ruleId.localeCompare(b.ruleId) ||
        (a.period ?? "").localeCompare(b.period ?? ""),
    );
  const selected = list.find((f) => f.findingKey === q.finding) ?? list[0];
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries({
      show,
      severity: q.severity,
      responsible: q.responsible,
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
  const openItems = v.findings.filter(
    (f) => !CLOSED.includes(f.status) && f.type !== "info" && f.severity !== "info",
  );
  const stopping = openItems.filter((f) => findingStopsPreparation(f, v.rules.get(f.ruleId)));
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
  // Consistency rules have no requirement row; the finding itself carries the preparation effect.
  const effect =
    selected && row
      ? stageEffect(rule, row)
      : selected && !closed
        ? findingStopsPreparation(selected, rule)
          ? { blocks: true, text: "Must be resolved before the file can be prepared." }
          : {
              blocks: false,
              text: "Later lender work. It does not stop the file from being prepared.",
            }
        : null;
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
  const title = (f: (typeof list)[number]) =>
    reviewSubject(v.rules.get(f.ruleId)?.title ?? "") ||
    findingHeadline(f.type, (f.detailsJson as { message: string }).message);
  return (
    <>
      <PageHead
        title="Review"
        subtitle={`${openItems.length} open: ${stopping.length} must be resolved before the file can be prepared${openItems.length - stopping.length ? `, ${openItems.length - stopping.length} ${openItems.length - stopping.length === 1 ? "is" : "are"} later lender work` : ""}. ${closedCount} closed items are kept in history.`}
      />
      {!v.preparation.current ? (
        <p className="meta mb-3" role="note">
          These results are from the last check. Newer evidence is waiting to be checked.
        </p>
      ) : null}
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Show</span>
            <Link
              className={`btn btn-sm ${show === "open" ? "btn-primary" : ""}`}
              href={keep({ show: "open", finding: undefined })}
            >
              Open <span className="num">{v.counts.findingsOpen - v.counts.informational}</span>
            </Link>
            <Link
              className={`btn btn-sm ${show === "history" ? "btn-primary" : ""}`}
              href={keep({ show: "history", finding: undefined })}
            >
              History <span className="num">{closedCount}</span>
            </Link>
            <Link
              className={`btn btn-sm ${show === "info" ? "btn-primary" : ""}`}
              href={keep({ show: "info", finding: undefined })}
            >
              For information <span className="num">{v.counts.informational}</span>
            </Link>
          </div>
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="show" value={show} />
            <label className="flex flex-col gap-1" title={PRIORITY_HELP}>
              <span className="eyebrow">Priority</span>
              <select name="severity" defaultValue={q.severity ?? ""}>
                <option value="">Any</option>
                {[...new Set(v.findings.map((f) => f.severity))].sort().map((s) => (
                  <option key={s} value={s}>
                    {PRIORITY[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Responsible</span>
              <select name="responsible" defaultValue={q.responsible ?? ""}>
                <option value="">Anyone</option>
                {[...new Set(v.findings.map((f) => f.responsibleRole))].sort().map((s) => (
                  <option key={s} value={s}>
                    {responsibleName(s)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm">Apply filters</button>
          </form>
          <span className="meta ml-auto self-center">{list.length} shown</span>
        </div>
      </Card>

      {list.length ? (
        <div className="split">
          <Card flush className="max-h-[70vh] overflow-auto">
            {list.map((f) => (
              <Link
                key={f.findingKey}
                href={keep({ finding: f.findingKey })}
                scroll={false}
                className={`pick ${selected?.findingKey === f.findingKey ? "is-active" : ""}`}
                aria-current={selected?.findingKey === f.findingKey ? "true" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{title(f)}</p>
                  {f.severity === "blocker" && !CLOSED.includes(f.status) ? (
                    <Pill value="blocker" />
                  ) : null}
                </div>
                <p className="meta mt-1">
                  {v.party(f.scopeKey)}
                  {f.period ? ` · ${f.period}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill value={f.type} />
                  {CLOSED.includes(f.status) ? <Pill value={f.status} /> : null}
                  {!CLOSED.includes(f.status) &&
                  stageOf(v.rules.get(f.ruleId)) === "later_lender" ? (
                    <Pill value="later_lender" label="Later lender work" tone="quiet" />
                  ) : null}
                </div>
              </Link>
            ))}
          </Card>

          {selected && d ? (
            // Keyed by item so unsaved notes never carry over to another selection.
            <div className="space-y-5" key={selected.findingKey}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-[19px]">{title(selected)}</h2>
                    <p className="meta mt-1">
                      {v.party(selected.scopeKey)}
                      {selected.period ? ` · ${selected.period}` : ""} · responsible:{" "}
                      {responsibleName(selected.responsibleRole)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill value={selected.status} />
                    <Pill value={selected.severity} title={PRIORITY_HELP} />
                  </div>
                </div>
                {closed ? (
                  <p className="mt-3">
                    This item was {selected.status}.{" "}
                    {ex?.summary ? `When it was open: ${ex.summary}` : ""}
                  </p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[15px]">
                      {ex?.family === "disagreement" && facts.length > 1
                        ? `The sources give different values: ${[
                            ...new Set(
                              facts.map((x) => {
                                const fact = v.sourceFacts.find((f) => f.id === x.fact_id);
                                return factValue(
                                  fact?.attribute ?? "",
                                  fact?.unit ?? "text",
                                  x.value,
                                );
                              }),
                            ),
                          ].join(", ")}. AcqFile does not decide which is right.`
                        : (ex?.summary ?? d.message)}
                    </p>
                    {ex?.open[0]?.saved ? <p className="meta">{ex.open[0].saved}</p> : null}
                    {ex?.note ? <p className="meta">{ex.note}</p> : null}
                    {ex?.open.slice(1).map((l, i) => (
                      <p key={i} className="meta">
                        Also: {l.text}
                      </p>
                    ))}
                    {effect?.text ? (
                      <p className="meta font-medium text-[var(--fg)]">{effect.text}</p>
                    ) : null}
                  </div>
                )}
                {selected.reason ? (
                  <p className="meta mt-2">
                    <span className="eyebrow">Recorded reason</span> {selected.reason}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {href && ex?.action.label ? (
                    <Link className="btn btn-primary btn-sm" href={href}>
                      {ex.action.label}
                    </Link>
                  ) : null}
                  {rowKey ? (
                    <Link
                      className="link"
                      href={`${base}/requirements?show=all&focus=${encodeURIComponent(rowKey)}#${encodeURIComponent(rowKey)}`}
                    >
                      Open requirement: {row!.item}
                    </Link>
                  ) : null}
                </div>
              </Card>

              {recordOnly || ex?.family === "missing" || ex?.family === "proposed" ? (
                <Card
                  title="Documents on file"
                  description={
                    ex?.family === "tracking"
                      ? "The lender supplies this. No borrower document is requested."
                      : ex?.family === "manual"
                        ? "These are on file for this requirement. They do not show that the open check was done; record it with the check itself."
                        : undefined
                  }
                  flush={onFile.length > 0}
                >
                  {onFile.length ? (
                    <ul>
                      {onFile.map((s) => (
                        <li key={s.id} className="rowline">
                          <Link className="link" href={sourceLink(s.versionId, s.page)}>
                            View{" "}
                            {documentName(
                              v.segments.find(
                                (x) =>
                                  x.documentVersionId === s.versionId &&
                                  x.pageStart <= s.page &&
                                  x.pageEnd >= s.page,
                              )?.docType ?? "",
                            ) || "supplied document"}
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
                </Card>
              ) : (
                <Card
                  title="Values the check used"
                  description={
                    facts.length
                      ? "Each value as recorded on this item, with its source. Compare them before correcting anything."
                      : "No value was cited for this item."
                  }
                  flush={facts.length > 0}
                >
                  {facts.length ? (
                    <table className="grid">
                      <thead>
                        <tr>
                          <th className="w-[30%]">Value</th>
                          <th className="w-[28%]">Source</th>
                          <th>Quoted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {facts.map((s, i) => {
                          const fact = v.sourceFacts.find((f) => f.id === s.fact_id);
                          return (
                            <tr key={i}>
                              <td>
                                <p className="meta">
                                  {fact ? attributeName(fact.attribute) : "Value"}
                                </p>
                                <p className="font-semibold">
                                  {factValue(fact?.attribute ?? "", fact?.unit ?? "text", s.value)}
                                </p>
                                <p className="meta">
                                  {fact?.method === "manual"
                                    ? "Entered by staff"
                                    : "Read from the document"}
                                </p>
                              </td>
                              <td>
                                {v.versions.some((x) => x.id === s.file) ? (
                                  <>
                                    <Link className="link" href={sourceLink(s.file, s.page)}>
                                      View{" "}
                                      {documentName(
                                        v.segments.find(
                                          (x) =>
                                            x.documentVersionId === s.file &&
                                            s.page !== null &&
                                            x.pageStart <= s.page &&
                                            x.pageEnd >= s.page,
                                        )?.docType ?? "",
                                      ) || "supplied document"}
                                    </Link>
                                    <p className="meta">Page {s.page}</p>
                                  </>
                                ) : (
                                  <span className="meta">Source not on file</span>
                                )}
                              </td>
                              <td className="italic">{s.quote}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : ex?.family === "document" && metadata.length ? (
                    <ul className="space-y-2">
                      {metadata.map((m, i) => (
                        <li key={i}>
                          <p className="meta">Document details as filed</p>
                          <p className="font-semibold">{factValue("", "text", m.value)}</p>
                          <p className="italic">{m.quote}</p>
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
                  {facts.length && ex?.family === "document" && metadata.length ? (
                    <p className="meta px-[18px] py-3">
                      Document details as filed:{" "}
                      {metadata.map((m) => factValue("", "text", m.value)).join("; ")}
                    </p>
                  ) : null}
                </Card>
              )}
              {dependencies.length ? (
                <p className="meta">
                  This check also compares against the deal profile: {dependencies.join(", ")}.{" "}
                  <Link className="link" href={`${base}/profile`}>
                    Open profile
                  </Link>
                </p>
              ) : null}

              {editable && !closed ? (
                <Card title="Other options">
                  <ul className="meta mb-3 list-disc space-y-1 pl-5">
                    <li>
                      Dismiss: closes this review item with your reason. The requirement keeps its
                      status until its checks pass or it is waived
                      {effect?.blocks ? ", so it still stops the file from being prepared" : ""}.
                    </li>
                    <li>
                      Waive: marks the requirement as waived with your reason. It counts as waived,
                      not satisfied. It is not lender approval.
                    </li>
                    <li>Both are recorded with your name. Neither changes any evidence.</li>
                  </ul>
                  <DecisionForm
                    action={decisionAction.bind(null, dealId)}
                    className="flex flex-wrap items-end gap-2"
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
                </Card>
              ) : null}

              <details className="reveal">
                <summary>Technical detail</summary>
                <Card className="mt-2">
                  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
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
                </Card>
              </details>
            </div>
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
