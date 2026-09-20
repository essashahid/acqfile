import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { FINDING_MEANING, documentName, factValue, findingHeadline } from "@/lib/staff/labels";
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
  const show = q.show === "history" ? "history" : "open";
  const list = v.findings
    .filter((f) => (show === "history" ? CLOSED.includes(f.status) : !CLOSED.includes(f.status)))
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
  // Evidence the engine cited. Page-less entries are the declared profile, not a document page.
  const cited = d?.details.filter((x) => x.page !== null) ?? [];
  const fromProfile = d?.details.some((x) => x.page === null) ?? false;
  const resolvedSegments = selected?.resolvedByJson
    ? ((selected.resolvedByJson as { segment_ids: string[] }).segment_ids ?? [])
    : [];
  return (
    <>
      <PageHead
        title="Review"
        subtitle={`${v.counts.findingsOpen} open, including ${v.counts.blockers} blocker${v.counts.blockers === 1 ? "" : "s"}. ${v.counts.findingsTotal - v.counts.findingsOpen} closed findings are kept in history.`}
      />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Show</span>
            <Link
              className={`btn btn-sm ${show === "open" ? "btn-primary" : ""}`}
              href={keep({ show: "open", finding: undefined })}
            >
              Open{" "}
              <span className="num">
                {v.findings.filter((f) => !CLOSED.includes(f.status)).length}
              </span>
            </Link>
            <Link
              className={`btn btn-sm ${show === "history" ? "btn-primary" : ""}`}
              href={keep({ show: "history", finding: undefined })}
            >
              History{" "}
              <span className="num">
                {v.findings.filter((f) => CLOSED.includes(f.status)).length}
              </span>
            </Link>
          </div>
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="show" value={show} />
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Severity</span>
              <select name="severity" defaultValue={q.severity ?? ""}>
                <option value="">Any</option>
                {[...new Set(v.findings.map((f) => f.severity))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Responsible</span>
              <select name="responsible" defaultValue={q.responsible ?? ""}>
                <option value="">Anyone</option>
                {[...new Set(v.findings.map((f) => f.responsibleRole))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm">Apply</button>
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
                className={`pick ${selected?.findingKey === f.findingKey ? "is-active" : ""}`}
                aria-current={selected?.findingKey === f.findingKey ? "true" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">
                    {findingHeadline(f.type, (f.detailsJson as { message: string }).message) ||
                      f.ruleId}
                  </p>
                  {f.severity === "blocker" && !CLOSED.includes(f.status) ? (
                    <span className="pill pill-bad shrink-0">Blocker</span>
                  ) : null}
                </div>
                <p className="meta mt-1">
                  {v.party(f.scopeKey)}
                  {f.period ? ` · ${f.period}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill value={f.type} />
                  {CLOSED.includes(f.status) ? <Pill value={f.status} /> : null}
                </div>
              </Link>
            ))}
          </Card>

          {selected && d ? (
            <div className="space-y-5">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-[19px]">
                      {findingHeadline(selected.type, d.message) || selected.ruleId}
                    </h2>
                    <p className="meta mt-1">
                      {v.party(selected.scopeKey)}
                      {selected.period ? ` · ${selected.period}` : ""} · responsible{" "}
                      {selected.responsibleRole}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill value={selected.type} />
                    <Pill value={selected.severity} />
                    <Pill value={selected.status} />
                  </div>
                </div>
                <p className="mt-3">{FINDING_MEANING[selected.type] ?? ""}</p>
                {selected.reason ? (
                  <p className="meta mt-2">
                    <span className="eyebrow">Operator reason</span> {selected.reason}
                  </p>
                ) : null}
              </Card>

              <Card
                title="Evidence"
                description={
                  cited.length
                    ? "What the engine read, with the page it read it from."
                    : "No document page was cited for this finding."
                }
                flush={cited.length > 0}
              >
                {cited.length ? (
                  <table className="grid">
                    <thead>
                      <tr>
                        <th className="w-[28%]">Value</th>
                        <th className="w-[30%]">Source</th>
                        <th>Quoted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cited.map((s, i) => (
                        <tr key={i}>
                          <td className="font-semibold">{factValue("", "text", s.value)}</td>
                          <td>
                            {v.versions.some((x) => x.id === s.file) ? (
                              <>
                                <Link
                                  className="link"
                                  href={`/staff/deals/${dealId}/documents/${s.file}?page=${s.page}`}
                                >
                                  {documentName(
                                    v.segments.find((x) => x.documentVersionId === s.file)
                                      ?.docType ?? "",
                                  ) || "Supplied document"}
                                </Link>
                                <p className="meta">
                                  page {s.page} · {v.originalPath(s.file)}
                                </p>
                              </>
                            ) : (
                              <span className="meta">Deal profile</span>
                            )}
                          </td>
                          <td className="italic">{s.quote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>
                    {fromProfile
                      ? "This finding was determined from the declared deal profile and the rule parameters."
                      : "No cited evidence."}
                  </Empty>
                )}
                {cited.length && fromProfile ? (
                  <p className="meta px-[18px] py-3">
                    The declared deal profile was also read when evaluating this rule.
                  </p>
                ) : null}
              </Card>

              {resolvedSegments.length ? (
                <Card
                  title="Referenced evidence"
                  description="Documents current when this finding stopped being raised. The system does not record which one caused it."
                  flush
                >
                  <ul>
                    {resolvedSegments.slice(0, 6).map((id) => {
                      const segment = v.segments.find((s) => s.id === id);
                      return segment ? (
                        <li key={id} className="rowline">
                          <Link
                            className="link"
                            href={`/staff/deals/${dealId}/documents/${segment.documentVersionId}?page=${segment.pageStart}`}
                          >
                            {v.originalPath(segment.documentVersionId)}
                          </Link>
                          <span className="meta"> · page {segment.pageStart}</span>
                        </li>
                      ) : null;
                    })}
                    {resolvedSegments.length > 6 ? (
                      <li className="rowline meta">
                        and {resolvedSegments.length - 6} more current at that time
                      </li>
                    ) : null}
                  </ul>
                </Card>
              ) : null}

              {editable && !CLOSED.includes(selected.status) ? (
                <Card title="Decide">
                  <p className="meta mb-3">
                    Dismissing records that this finding does not apply. Waiving also waives the
                    requirement row. Both need a reason and are recorded against your name. Neither
                    changes the evidence.
                  </p>
                  <form
                    action={decisionAction.bind(null, dealId)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="finding_key" value={selected.findingKey} />
                    <label className="flex min-w-[18rem] flex-1 flex-col gap-1">
                      <span className="eyebrow">Reason (required)</span>
                      <input name="reason" aria-label="Decision reason" required />
                    </label>
                    <button className="btn" name="action" value="dismiss">
                      Dismiss finding
                    </button>
                    <button className="btn" name="action" value="waive">
                      Waive requirement
                    </button>
                  </form>
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
                      <dt className="eyebrow">Raw check result</dt>
                      <dd className="text-[13px]">{d.message}</dd>
                    </div>
                  </dl>
                </Card>
              </details>
            </div>
          ) : null}
        </div>
      ) : (
        <Card>
          <Empty>
            {show === "open" ? "No open findings match these filters." : "No closed findings yet."}
          </Empty>
        </Card>
      )}
    </>
  );
}
