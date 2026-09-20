import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildIndex } from "@/lib/deliverables/index-build";
import { attestAction } from "../../deliverable-actions";
import { DeliverableNav } from "../DeliverableNav";
export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const b = await buildIndex(dealId);
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
  return (
    <>
      <DeliverableNav dealId={dealId} />
      <h1>Checklist</h1>
      {[...new Set(b.index.map(group))].map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Item / period</th>
                <th>Status / checks</th>
                <th>Documents</th>
                <th>Attestations</th>
              </tr>
            </thead>
            <tbody>
              {b.index
                .filter((r) => group(r) === g)
                .map((r) => (
                  <tr
                    className="border-b"
                    key={r.item_id + r.scope_key + r.period}
                    data-testid={`${r.item_id}-${r.scope_key}-${r.period}`}
                  >
                    <td>
                      {r.item_id} · {r.item}
                      <br />
                      {r.party} {r.period}
                      <br />
                      Rule unverified
                    </td>
                    <td>
                      {r.status}
                      <ul>
                        {r.checks.map((c, i) => (
                          <li key={i}>
                            {c.type}: {c.result} · {c.message}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      {r.segments.map((s) => (
                        <p key={s.id}>
                          <Link
                            className="underline"
                            href={`/staff/deals/${dealId}/files/${s.versionId}?page=${s.page}`}
                          >
                            {s.label}, page {s.page}
                          </Link>
                        </p>
                      ))}
                    </td>
                    <td>
                      {mutationAllowed(ctx) && (
                        <>
                          {[
                            ...b.rules
                              .get(r.item_id)!
                              .checks.filter((c) =>
                                ["tracking", "manual_confirmation"].includes(c.type),
                              ),
                            { type: "waiver", note_key: "" },
                          ].map((c, i) => (
                            <form key={i} action={attestAction.bind(null, dealId)}>
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
                              <button>
                                {c.type === "waiver"
                                  ? "Waive row"
                                  : c.type === "tracking"
                                    ? "Save tracking"
                                    : "Save confirmation"}
                              </button>
                            </form>
                          ))}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
