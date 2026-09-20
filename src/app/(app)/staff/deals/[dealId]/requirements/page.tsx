import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView, requirementGroups } from "@/lib/staff/deal-view";
import { checkOutcome, STATUS_MEANING } from "@/lib/staff/labels";
import { attestAction } from "../../deliverable-actions";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

const OPEN = ["missing", "received_with_issues", "needs_review"];

export default async function Requirements({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ show?: string; group?: string }>;
}) {
  const { dealId } = await params;
  const q = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const editable = mutationAllowed(ctx);
  // Controls must start from persisted state, never from the first option in the list.
  const attestations = await getDb()
    .select()
    .from(schema.attestations)
    .where(eq(schema.attestations.dealId, dealId));
  const saved = (kind: string, ruleId: string, scope: string, period: string) =>
    attestations.find(
      (a) =>
        a.kind === kind &&
        a.ruleId === ruleId &&
        a.scopeKey === scope &&
        (a.period ?? "") === (period ?? ""),
    );
  const show = q.show === "all" ? "all" : q.show === "not_applicable" ? "not_applicable" : "open";
  const visible = v.index.filter((r) =>
    show === "all"
      ? true
      : show === "not_applicable"
        ? r.status === "not_applicable"
        : OPEN.includes(r.status),
  );
  const groups = requirementGroups(visible, v.rules);
  const c = v.counts;
  const tabs = [
    ["open", "Needs work", v.index.filter((r) => OPEN.includes(r.status)).length],
    ["all", "All", v.index.length],
    ["not_applicable", "Not applicable", c.notApplicable],
  ] as const;
  return (
    <>
      <PageHead
        title="Requirements"
        subtitle={`${c.required.done} of ${c.required.applicable} applicable required requirements satisfied or waived. ${c.notApplicable} not applicable, excluded from that count.`}
      />
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Show</span>
          {tabs.map(([key, label, count]) => (
            <Link
              key={key}
              href={`?show=${key}`}
              className={`btn btn-sm ${show === key ? "btn-primary" : ""}`}
              aria-current={show === key ? "true" : undefined}
            >
              {label} <span className="num">{count}</span>
            </Link>
          ))}
        </div>
      </Card>
      <div className="space-y-5">
        {groups.map((g) => (
          <Card
            key={g.name}
            title={g.name}
            description={`${g.rows.filter((r) => ["satisfied", "waived"].includes(r.status)).length} of ${g.rows.length} satisfied or waived`}
            flush
          >
            <table className="grid">
              <thead>
                <tr>
                  <th className="w-[34%]">Requirement</th>
                  <th className="w-[14%]">Status</th>
                  <th className="w-[30%]">Evidence</th>
                  <th className="w-[22%]">Detail and actions</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => {
                  const rule = v.rules.get(r.item_id)!;
                  const failed = r.checks.filter((ch) => ch.result !== "pass");
                  const tracking = rule.checks.find((ch) => ch.type === "tracking");
                  const confirmations = rule.checks.filter(
                    (ch) => ch.type === "manual_confirmation",
                  );
                  // GUA-02 repeats per party and period, so identity is the full row key.
                  const rowKey = `${r.item_id}|${r.scope_key}|${r.period}`;
                  return (
                    <tr key={rowKey} data-testid={`${r.item_id}-${r.scope_key}-${r.period}`}>
                      <td>
                        <p className="font-semibold">{r.item}</p>
                        <p className="meta mt-0.5">
                          {r.party}
                          {r.period ? ` · ${r.period}` : ""}
                        </p>
                      </td>
                      <td>
                        <Pill value={r.status} />
                        <p className="meta mt-1.5">{STATUS_MEANING[r.status]}</p>
                      </td>
                      <td>
                        {r.segments.length ? (
                          <ul className="space-y-1">
                            {r.segments.slice(0, 3).map((s) => (
                              <li key={s.id}>
                                <Link
                                  className="link"
                                  href={`/staff/deals/${dealId}/documents/${s.versionId}?page=${s.page}`}
                                >
                                  {s.label}
                                </Link>
                              </li>
                            ))}
                            {r.segments.length > 3 ? (
                              <li className="meta">and {r.segments.length - 3} more</li>
                            ) : null}
                          </ul>
                        ) : (
                          <span className="meta">No document filed against this requirement.</span>
                        )}
                        {failed.length ? (
                          <p className="meta mt-1.5">
                            {failed.length} check{failed.length === 1 ? "" : "s"} not met
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <details className="reveal">
                          <summary>Checks and rule</summary>
                          <div className="mt-2 space-y-3">
                            <ul className="space-y-1.5">
                              {r.checks.map((ch, i) => {
                                const o = checkOutcome(ch.type, ch.result, ch.message);
                                return (
                                  <li key={i}>
                                    <Pill value={ch.result} title={`${ch.type}: ${ch.result}`} />{" "}
                                    <span>{o.detail}</span>
                                  </li>
                                );
                              })}
                              {!r.checks.length ? (
                                <li className="meta">
                                  No checks ran. Absence short-circuits the rest.
                                </li>
                              ) : null}
                            </ul>
                            <p className="meta">
                              Rule {r.item_id} · responsible {rule.responsible} · unverified
                            </p>
                            {editable ? (
                              <div className="space-y-3 border-t border-[var(--line)] pt-3">
                                {tracking ? (
                                  <form
                                    action={attestAction.bind(null, dealId)}
                                    className="space-y-1.5"
                                  >
                                    <input type="hidden" name="kind" value="tracking" />
                                    <input type="hidden" name="rule_id" value={r.item_id} />
                                    <input type="hidden" name="scope_key" value={r.scope_key} />
                                    <input type="hidden" name="period" value={r.period} />
                                    <input type="hidden" name="key" value="" />
                                    <label className="flex flex-col gap-1">
                                      <span className="eyebrow">Lender-ordered tracking</span>
                                      <select
                                        aria-label="Tracking state"
                                        name="state"
                                        defaultValue={
                                          saved("tracking", r.item_id, r.scope_key, r.period)
                                            ?.state ?? "not_started"
                                        }
                                      >
                                        <option value="not_started">Not started</option>
                                        <option value="ordered">Ordered</option>
                                        <option value="received">Received</option>
                                      </select>
                                    </label>
                                    <input
                                      name="note"
                                      aria-label="tracking reason"
                                      placeholder="Note"
                                      defaultValue={
                                        saved("tracking", r.item_id, r.scope_key, r.period)?.note ??
                                        ""
                                      }
                                      required
                                    />
                                    <button className="btn btn-sm w-full">Save tracking</button>
                                  </form>
                                ) : null}
                                {confirmations.map((ch, i) => {
                                  const on = saved(
                                    "manual_confirmation",
                                    r.item_id,
                                    r.scope_key,
                                    r.period,
                                  );
                                  return (
                                    <form
                                      key={i}
                                      action={attestAction.bind(null, dealId)}
                                      className="space-y-1.5"
                                    >
                                      <input
                                        type="hidden"
                                        name="kind"
                                        value="manual_confirmation"
                                      />
                                      <input type="hidden" name="rule_id" value={r.item_id} />
                                      <input type="hidden" name="scope_key" value={r.scope_key} />
                                      <input type="hidden" name="period" value={r.period} />
                                      <input type="hidden" name="key" value={ch.note_key ?? ""} />
                                      <label className="flex flex-col gap-1">
                                        <span className="eyebrow">Operator confirmation</span>
                                        <select
                                          aria-label="Confirmation"
                                          name="confirmed"
                                          defaultValue={String(on?.confirmed ?? false)}
                                        >
                                          <option value="true">Confirmed</option>
                                          <option value="false">Not confirmed</option>
                                        </select>
                                      </label>
                                      <input
                                        name="note"
                                        aria-label="manual_confirmation reason"
                                        placeholder="Note"
                                        defaultValue={on?.note ?? ""}
                                        required
                                      />
                                      <button className="btn btn-sm w-full">
                                        Save confirmation
                                      </button>
                                    </form>
                                  );
                                })}
                                {r.status !== "waived" && r.status !== "not_applicable" ? (
                                  <form
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
                                        Counts the row as waived rather than satisfied, and is
                                        recorded against your name.
                                      </span>
                                      <input
                                        name="note"
                                        aria-label="waiver reason"
                                        placeholder="Reason (required)"
                                        required
                                      />
                                    </label>
                                    <button className="btn btn-sm w-full">Waive row</button>
                                  </form>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))}
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
