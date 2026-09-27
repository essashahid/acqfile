import { requirementEvidence } from "@/lib/staff/evidence";
import { DecisionForm } from "@/components/staff/DecisionForm";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { stageOf } from "@/lib/deliverables/readiness";
import { documentName, STATUS_MEANING } from "@/lib/staff/labels";
import {
  actionHref,
  controlId,
  explainItem,
  manualMeaning,
  stageEffect,
} from "@/lib/staff/explain";
import { attestAction } from "../../deliverable-actions";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

const OPEN = ["missing", "received_with_issues", "needs_review"];
type Group = "prep" | "optional" | "lender" | "na";
/** Groups say once what their rows mean for preparation, so no row repeats it. */
const GROUPS: { key: Group; name: string; note: string }[] = [
  {
    key: "prep",
    name: "Before the file can be prepared",
    note: "Each must be completed, or waived with a reason.",
  },
  { key: "optional", name: "Optional", note: "Does not stop the file from being prepared." },
  {
    key: "lender",
    name: "Later lender work",
    note: "Does not stop preparation. Not tracked does not mean the lender has not ordered it.",
  },
  { key: "na", name: "Not applicable", note: "The deal profile excludes these." },
];

export default async function Requirements({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ show?: string; group?: string; focus?: string }>;
}) {
  const { dealId } = await params;
  const q = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const editable = mutationAllowed(ctx);
  const base = `/staff/deals/${dealId}`;
  // Controls must start from persisted state, never from the first option in the list.
  const attestations = await getDb()
    .select()
    .from(schema.attestations)
    .where(eq(schema.attestations.dealId, dealId));
  const savedFor = (ruleId: string, scope: string, period: string) =>
    attestations.filter(
      (a) => a.ruleId === ruleId && a.scopeKey === scope && (a.period ?? "") === (period ?? ""),
    );
  const show = q.show === "all" ? "all" : q.show === "not_applicable" ? "not_applicable" : "open";
  const visible = v.index.filter((r) =>
    show === "all"
      ? true
      : show === "not_applicable"
        ? r.status === "not_applicable"
        : OPEN.includes(r.status),
  );
  // Grouped by stage, not by status, so a row stays where it is when its check is recorded.
  const groupOf = (r: (typeof v.index)[number]): Group => {
    if (r.status === "not_applicable") return "na";
    const rule = v.rules.get(r.item_id);
    if (stageOf(rule) === "later_lender") return "lender";
    if (rule?.required === false && !stageEffect(rule, r).blocks) return "optional";
    return "prep";
  };
  const groups = GROUPS.map((g) => ({
    ...g,
    rows: visible
      .filter((r) => groupOf(r) === g.key)
      .sort((a, b) => a.item.localeCompare(b.item) || a.party.localeCompare(b.party)),
  })).filter((g) => g.rows.length);
  const c = v.counts;
  const openRows = v.index.filter((r) => OPEN.includes(r.status));
  const tabs = [
    ["open", "Needs work", openRows.length],
    ["all", "All", v.index.length],
    ["not_applicable", "Not applicable", c.notApplicable],
  ] as const;
  return (
    <>
      <PageHead
        title="Requirements"
        subtitle={`Preparation: ${c.required.done} of ${c.required.applicable} complete or waived · later lender work not counted · ${c.notApplicable} not applicable`}
        actions={
          <nav className="seg" aria-label="Show">
            {tabs.map(([key, label, count]) => (
              <Link
                key={key}
                href={`?show=${key}`}
                aria-current={show === key ? "page" : undefined}
              >
                {label} <span className="num">{count}</span>
              </Link>
            ))}
          </nav>
        }
      />
      {!v.preparation.current ? (
        <p className="meta mb-3" role="note">
          These results are from the last check. Newer evidence is waiting to be checked.
        </p>
      ) : null}
      <div className="space-y-5">
        {groups.length ? (
          <Card flush>
            <table className="grid stack req-table">
              <thead>
                <tr>
                  <th className="w-[38%]">Requirement</th>
                  <th className="w-[16%]">Status</th>
                  <th className="w-[22%]">On file</th>
                  <th className="w-[24%]">Next step</th>
                </tr>
              </thead>
              {groups.map((g) => {
                // A note that every row in the group carries is said once, in the group row.
                const notes = [
                  ...new Set(
                    g.rows
                      .map(
                        (r) =>
                          explainItem({
                            rule: v.rules.get(r.item_id)!,
                            status: r.status,
                            checks: r.checks,
                            parameters: v.pack.parameters,
                          }).note,
                      )
                      .filter((n): n is string => !!n),
                  ),
                ];
                return (
                  <tbody key={g.key} className={`req-group is-${g.key}`}>
                    <tr className="req-group-row">
                      <td colSpan={4}>
                        <span
                          className={`mk mk-${g.key === "prep" ? "waiting" : "lender"}`}
                          aria-hidden
                        />
                        <b>{g.name}</b>
                        <span className="num">{g.rows.length}</span>
                        <span className="meta">{g.note}</span>
                        {notes.map((n) => (
                          <span key={n} className="req-note">
                            {n}
                          </span>
                        ))}
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const rule = v.rules.get(r.item_id)!;
                      const evidence = requirementEvidence(v, r);
                      const saved = savedFor(r.item_id, r.scope_key, r.period);
                      const finding = v.findings.find(
                        (f) =>
                          f.ruleId === r.item_id &&
                          f.scopeKey === r.scope_key &&
                          (f.period ?? "") === r.period,
                      );
                      const ex = explainItem({
                        rule,
                        status: r.status,
                        checks: r.checks,
                        findingType: finding?.type,
                        findingMessage: (finding?.detailsJson as { message?: string })?.message,
                        parameters: v.pack.parameters,
                        saved: saved.map((a) => ({ ...a, key: a.key ?? "" })),
                      });
                      const effect = stageEffect(rule, r);
                      const tracking = rule.checks.find((ch) => ch.type === "tracking");
                      const confirmations = rule.checks.filter(
                        (ch) => ch.type === "manual_confirmation",
                      );
                      // GUA-02 repeats per party and period, so identity is the full row key.
                      const rowKey = `${r.item_id}|${r.scope_key}|${r.period}`;
                      const focused = q.focus === rowKey;
                      const first = evidence[0];
                      const firstSegment = first
                        ? v.segments.find((s) => s.id === first.id)
                        : undefined;
                      const href = actionHref(ex.action.kind, base, {
                        rowKey,
                        noteKey: ex.action.noteKey,
                        show,
                        document: first
                          ? {
                              versionId: first.versionId,
                              page: first.page,
                              segmentId: firstSegment?.id,
                            }
                          : undefined,
                      });
                      const failed = ex.open.filter((l) => l.result === "fail").length;
                      const unconfirmed = ex.open.length - failed;
                      const closed = ["satisfied", "waived", "not_applicable"].includes(r.status);
                      // The first control that still needs an answer takes focus when linked here.
                      const focusKey =
                        confirmations.find(
                          (ch) =>
                            !saved.some(
                              (a) => a.kind === "manual_confirmation" && a.key === ch.note_key,
                            ),
                        )?.note_key ?? (tracking ? "tracking" : confirmations[0]?.note_key);
                      return (
                        <tr
                          id={rowKey}
                          key={rowKey}
                          data-testid={`${r.item_id}-${r.scope_key}-${r.period}`}
                          className={focused ? "is-focus" : undefined}
                        >
                          <td>
                            <p className="font-semibold">{r.item}</p>
                            <p className="meta mt-0.5">
                              {r.party}
                              {r.period ? ` · ${r.period}` : ""}
                            </p>
                            {!closed ? (
                              <div className="mt-2 space-y-1.5">
                                {ex.family === "tracking" ? null : (
                                  <p>{ex.family === "manual" ? ex.brief : ex.summary}</p>
                                )}
                                {ex.open[0]?.saved &&
                                ex.family !== "tracking" &&
                                !ex.open[0].saved.startsWith("Nothing") ? (
                                  <p className="meta">{ex.open[0].saved}</p>
                                ) : null}
                                {ex.open.slice(1).map((l, i) => (
                                  <p key={i} className="meta">
                                    Also: {l.text}
                                  </p>
                                ))}
                              </div>
                            ) : r.status === "waived" && r.decision_reason ? (
                              <p className="meta mt-2">Waiver reason: {r.decision_reason}</p>
                            ) : null}
                          </td>
                          <td>
                            {ex.family === "tracking" && !closed ? (
                              <Pill value="tracking" label={ex.brief} tone="quiet" />
                            ) : (
                              <Pill value={r.status} />
                            )}
                            {closed ? (
                              <p className="meta mt-1.5">{STATUS_MEANING[r.status]}</p>
                            ) : null}
                            {ex.open.length && ex.family !== "tracking" ? (
                              <p className="meta mt-1">
                                {[
                                  failed ? `${failed} not met` : "",
                                  unconfirmed ? `${unconfirmed} not confirmed yet` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            ) : null}
                            {effect.text && !["prep", "lender", "optional"].includes(g.key) ? (
                              <p className="meta mt-1">{effect.text}</p>
                            ) : effect.text.startsWith("Stage or responsibility") ? (
                              <p className="meta mt-1">{effect.text}</p>
                            ) : null}
                          </td>
                          <td>
                            {evidence.length ? (
                              <ul className="space-y-1">
                                {evidence.map((s) => (
                                  <li key={s.id}>
                                    <Link
                                      className="link"
                                      href={`${base}/documents/${s.versionId}?page=${s.page}&row=${encodeURIComponent(rowKey)}&from=requirements`}
                                    >
                                      View{" "}
                                      {documentName(
                                        v.segments.find((document) => document.id === s.id)
                                          ?.docType ?? s.label,
                                      )}
                                    </Link>
                                    <span className="meta"> · page {s.page}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="meta">None filed</span>
                            )}
                            {evidence.length &&
                            (ex.family === "manual" || ex.family === "tracking") ? (
                              <p className="meta mt-1.5">Doesn’t show the check was done</p>
                            ) : null}
                          </td>
                          <td>
                            {!closed && href && ex.action.label ? (
                              <Link className="btn btn-sm mb-2 w-full" href={href}>
                                {ex.action.label}
                              </Link>
                            ) : null}
                            <details className="reveal" open={focused || undefined}>
                              <summary>
                                {editable ? "All checks and actions" : "All checks"}
                              </summary>
                              <div className="mt-2 space-y-3">
                                <ul className="space-y-1.5">
                                  {[...ex.open, ...ex.passed].map((l, i) => (
                                    <li key={i}>
                                      <Pill
                                        value={l.result}
                                        label={l.label}
                                        tone={l.tone}
                                        title={`${l.type}: ${l.result}`}
                                      />{" "}
                                      <span className={l.result === "pass" ? "meta" : undefined}>
                                        {l.text}
                                      </span>
                                      {l.saved ? <p className="meta mt-0.5">{l.saved}</p> : null}
                                    </li>
                                  ))}
                                  {!r.checks.length ? (
                                    <li className="meta">
                                      {r.status === "not_applicable"
                                        ? "No checks run for a requirement that does not apply."
                                        : "Other checks run once a document is on file."}
                                    </li>
                                  ) : null}
                                </ul>
                                {editable ? (
                                  <div className="space-y-3 border-t border-[var(--line)] pt-3">
                                    {tracking ? (
                                      <DecisionForm
                                        action={attestAction.bind(null, dealId)}
                                        className="space-y-1.5 scroll-mt-24"
                                        id={controlId("tracking", rowKey)}
                                      >
                                        <input type="hidden" name="kind" value="tracking" />
                                        <input type="hidden" name="rule_id" value={r.item_id} />
                                        <input type="hidden" name="scope_key" value={r.scope_key} />
                                        <input type="hidden" name="period" value={r.period} />
                                        <input type="hidden" name="key" value="" />
                                        <label className="flex flex-col gap-1">
                                          <span className="eyebrow">Lender tracking status</span>
                                          <select
                                            aria-label="Tracking state"
                                            name="state"
                                            required
                                            autoFocus={focused && focusKey === "tracking"}
                                            defaultValue={
                                              saved.find((a) => a.kind === "tracking")?.state ?? ""
                                            }
                                          >
                                            <option value="" disabled>
                                              Not recorded yet
                                            </option>
                                            <option value="not_started">Not started</option>
                                            <option value="ordered">Ordered</option>
                                            <option value="received">Received</option>
                                          </select>
                                        </label>
                                        <input
                                          name="note"
                                          aria-label="Tracking note"
                                          placeholder="Note (required)"
                                          defaultValue={
                                            saved.find((a) => a.kind === "tracking")?.note ?? ""
                                          }
                                          required
                                        />
                                        <button className="btn btn-sm w-full">Save tracking</button>
                                      </DecisionForm>
                                    ) : null}
                                    {confirmations.map((ch) => {
                                      const key = ch.note_key ?? "";
                                      const on = saved.find(
                                        (a) => a.kind === "manual_confirmation" && a.key === key,
                                      );
                                      const line = ex.open
                                        .concat(ex.passed)
                                        .find((l) => l.noteKey === key);
                                      return (
                                        <DecisionForm
                                          key={key}
                                          action={attestAction.bind(null, dealId)}
                                          className="space-y-1.5 scroll-mt-24"
                                          id={controlId("confirm", rowKey, key)}
                                        >
                                          <input
                                            type="hidden"
                                            name="kind"
                                            value="manual_confirmation"
                                          />
                                          <input type="hidden" name="rule_id" value={r.item_id} />
                                          <input
                                            type="hidden"
                                            name="scope_key"
                                            value={r.scope_key}
                                          />
                                          <input type="hidden" name="period" value={r.period} />
                                          <input type="hidden" name="key" value={key} />
                                          <p className="eyebrow">Manual check</p>
                                          {line ? (
                                            <p className="text-[13.5px]">{line.text}</p>
                                          ) : null}
                                          <p className="meta">{manualMeaning(key)}</p>
                                          <label className="flex flex-col gap-1">
                                            <span className="eyebrow">Status</span>
                                            <select
                                              aria-label="Check status"
                                              name="confirmed"
                                              autoFocus={focused && focusKey === key}
                                              defaultValue={on ? String(on.confirmed) : ""}
                                              required
                                            >
                                              <option value="" disabled>
                                                Not recorded yet
                                              </option>
                                              <option value="true">Completed</option>
                                              <option value="false">Not completed yet</option>
                                            </select>
                                          </label>
                                          <textarea
                                            name="note"
                                            aria-label="Check note"
                                            rows={3}
                                            placeholder="What you found and what was agreed (required)"
                                            defaultValue={on?.note ?? ""}
                                            required
                                          />
                                          <button className="btn btn-sm w-full">
                                            Save check record
                                          </button>
                                        </DecisionForm>
                                      );
                                    })}
                                    {r.status !== "waived" && r.status !== "not_applicable" ? (
                                      <DecisionForm
                                        action={attestAction.bind(null, dealId)}
                                        className="space-y-1.5"
                                      >
                                        <input type="hidden" name="kind" value="waiver" />
                                        <input type="hidden" name="rule_id" value={r.item_id} />
                                        <input type="hidden" name="scope_key" value={r.scope_key} />
                                        <input type="hidden" name="period" value={r.period} />
                                        <input type="hidden" name="key" value="" />
                                        <label className="flex flex-col gap-1">
                                          <span className="eyebrow">Waive this requirement</span>
                                          <span className="meta">
                                            Counts as waived, not satisfied, and is recorded with
                                            your name. It is not lender approval.
                                          </span>
                                          <input
                                            name="note"
                                            aria-label="waiver reason"
                                            placeholder="Reason (required)"
                                            required
                                          />
                                        </label>
                                        <button className="btn btn-sm w-full">
                                          Waive requirement
                                        </button>
                                      </DecisionForm>
                                    ) : null}
                                  </div>
                                ) : null}
                                <p className="meta border-t border-[var(--line)] pt-2">
                                  Rule {r.item_id} · responsible {rule.responsible} · stage{" "}
                                  {effect.stage} · rule not verified by a lender
                                </p>
                              </div>
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </Card>
        ) : null}
        {!groups.length ? (
          <Card>
            <Empty>
              {show === "open"
                ? "Nothing needs work. Switch to All to see satisfied requirements."
                : "Nothing to show."}
            </Empty>
          </Card>
        ) : null}
      </div>
    </>
  );
}
