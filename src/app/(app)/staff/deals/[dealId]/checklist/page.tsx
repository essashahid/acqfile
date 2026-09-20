import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildIndex } from "@/lib/deliverables/index-build";
import { attestAction } from "../../deliverable-actions";
import { Card, DealTabs, Empty, PageHead, Pill } from "@/components/staff";

export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const deal = await requireDeal(ctx, dealId);
  const b = await buildIndex(dealId);
  const editable = mutationAllowed(ctx);
  const group = (r: (typeof b.index)[number]) => {
    const rule = b.rules.get(r.item_id)!;
    return rule.checks.some((c) => c.type === "tracking")
      ? "Lender-ordered"
      : rule.scope === "buyer_entity"
        ? "Buyer entity"
        : rule.scope === "target_business"
          ? "Target business"
          : rule.scope === "deal"
            ? "Transaction"
            : r.party;
  };
  const groups = [...new Set(b.index.map(group))];
  const done = b.index.filter((r) => ["satisfied", "waived"].includes(r.status)).length;
  return (
    <>
      <PageHead
        eyebrow={deal.code}
        title="Checklist"
        subtitle={`${done} of ${b.index.length} rows satisfied or waived. Every rule is unverified.`}
      />
      <DealTabs dealId={dealId} current="checklist" />
      <div className="space-y-5">
        {groups.map((g) => {
          const rows = b.index.filter((r) => group(r) === g);
          return (
            <Card
              key={g}
              title={g}
              description={`${rows.filter((r) => ["satisfied", "waived"].includes(r.status)).length} of ${rows.length} done`}
              flush
            >
              <table className="grid">
                <thead>
                  <tr>
                    <th className="w-[26%]">Item</th>
                    <th className="w-[10%]">Status</th>
                    <th className="w-[28%]">Checks</th>
                    <th className="w-[20%]">Documents</th>
                    {editable ? <th className="w-[16%]">Attest</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.item_id + r.scope_key + r.period}
                      data-testid={`${r.item_id}-${r.scope_key}-${r.period}`}
                    >
                      <td>
                        <p className="font-semibold">{r.item_id}</p>
                        <p>{r.item}</p>
                        <p className="meta mt-1">
                          {r.party}
                          {r.period ? ` · ${r.period}` : ""} · rule unverified
                        </p>
                      </td>
                      <td>
                        <Pill value={r.status} />
                        {r.open_findings ? (
                          <p className="meta mt-1.5">{r.open_findings} open</p>
                        ) : null}
                      </td>
                      <td>
                        {r.checks.length ? (
                          <ul className="space-y-1.5">
                            {r.checks.map((c, i) => (
                              <li key={i} className="flex items-baseline gap-2">
                                <Pill value={c.result} />
                                <span>
                                  <span className="meta">{c.type.replaceAll("_", " ")}: </span>
                                  {c.message}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="meta">No checks ran.</span>
                        )}
                      </td>
                      <td>
                        {r.segments.length ? (
                          <ul className="space-y-1">
                            {r.segments.map((s) => (
                              <li key={s.id}>
                                <Link
                                  className="link"
                                  href={`/staff/deals/${dealId}/files/${s.versionId}?page=${s.page}`}
                                >
                                  {s.label}
                                </Link>
                                <span className="meta"> · page {s.page}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="meta">None</span>
                        )}
                      </td>
                      {editable ? (
                        <td>
                          <div className="space-y-3">
                            {[
                              ...b.rules
                                .get(r.item_id)!
                                .checks.filter((c) =>
                                  ["tracking", "manual_confirmation"].includes(c.type),
                                ),
                              { type: "waiver", note_key: "" },
                            ].map((c, i) => (
                              <form
                                key={i}
                                action={attestAction.bind(null, dealId)}
                                className="space-y-1.5"
                              >
                                <input type="hidden" name="kind" value={c.type} />
                                <input type="hidden" name="rule_id" value={r.item_id} />
                                <input type="hidden" name="scope_key" value={r.scope_key} />
                                <input type="hidden" name="period" value={r.period} />
                                <input type="hidden" name="key" value={c.note_key ?? ""} />
                                {c.type === "tracking" ? (
                                  <select aria-label="Tracking state" name="state">
                                    <option>not_started</option>
                                    <option>ordered</option>
                                    <option>received</option>
                                  </select>
                                ) : c.type === "manual_confirmation" ? (
                                  <select aria-label="Confirmation" name="confirmed">
                                    <option value="true">Confirmed</option>
                                    <option value="false">Not confirmed</option>
                                  </select>
                                ) : null}
                                <input
                                  name="note"
                                  aria-label={`${c.type} reason`}
                                  placeholder="Reason"
                                  required
                                />
                                <button className="btn btn-sm w-full">
                                  {c.type === "waiver"
                                    ? "Waive row"
                                    : c.type === "tracking"
                                      ? "Save tracking"
                                      : "Save confirmation"}
                                </button>
                              </form>
                            ))}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
        {!groups.length ? (
          <Card>
            <Empty>Nothing to show. Evaluate the deal after documents arrive.</Empty>
          </Card>
        ) : null}
      </div>
    </>
  );
}
