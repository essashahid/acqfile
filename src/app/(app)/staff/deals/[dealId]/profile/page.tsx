import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { readDeal, dealDraft } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { loadPack } from "@/lib/rules/loader";
import { DealEditor } from "../../DealEditor";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

export default async function Profile({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const { deal, parties, ownership } = await readDeal(ctx, dealId);
  const editable = mutationAllowed(ctx);
  const pack =
    deal.rulePackVersion === "unknown"
      ? null
      : loadPack(deal.rulePackVersion, deal.overlayId ?? undefined);
  const name = (id: string) => parties.find((p) => p.id === id)?.legalName ?? id;
  const profile = deal.profileJson as Record<string, unknown>;
  const term = (key: string) => {
    const value = profile[key];
    if (value === null || value === undefined || value === "unknown") return "Unknown";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "number") return value.toLocaleString("en-US");
    return String(value);
  };
  return (
    <>
      <PageHead
        title="Profile and rules"
        subtitle="What the operator declared about this transaction, and the rule pack those declarations resolve to."
      />
      <div className="space-y-5">
        <Card title="Rule pack">
          {pack ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <p className="eyebrow">Pack</p>
                  <p className="font-medium">{pack.version}</p>
                </div>
                <div>
                  <p className="eyebrow">Overlay</p>
                  <p className="font-medium">{pack.overlay ?? "Base, no overlay"}</p>
                </div>
                <div>
                  <p className="eyebrow">As of</p>
                  <p className="font-medium tabular-nums">{deal.asOfDate}</p>
                </div>
                <div>
                  <p className="eyebrow">Requirements</p>
                  <p className="font-medium tabular-nums">
                    {pack.items.length} plus {pack.consistency.length} consistency rules
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-[9px] border border-[var(--warn-border)] bg-[var(--warn-soft)] px-3 py-2.5 text-[13px] text-[var(--warn)]">
                Every rule in this pack is unverified. No lender has confirmed any of them, and the
                results are preparation aids rather than determinations.
              </p>
              <p className="meta mt-3">
                <Link className="link" href="/staff/rulepacks">
                  Read and compare rule packs
                </Link>{" "}
                · the pack follows the expected loan-number date on the profile below.
              </p>
            </>
          ) : (
            <Empty>
              No rule pack is resolved. Set the expected loan-number date so one can be selected.
            </Empty>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Parties" description={`${parties.length} on this deal`} flush>
            <table className="grid">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Kind</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.legalName}</td>
                    <td>{p.kind}</td>
                    <td className="meta">{(p.roles as string[]).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Ownership" description={`${ownership.length} links`} flush>
            {ownership.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Owns</th>
                    <th>Percent</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ownership.map((o, i) => (
                    <tr key={i}>
                      <td className="font-medium">{name(o.ownerPartyId)}</td>
                      <td>{name(o.ownedPartyId)}</td>
                      <td className="num">
                        {o.percent === null ? "Unknown" : `${Number(o.percent)}%`}
                      </td>
                      <td>
                        <Pill value={o.origin} title={`${o.stage} · ${o.origin}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5">
                <Empty>No ownership links recorded.</Empty>
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Transaction terms"
          description="Declared by the operator. Extracted facts are compared against these."
        >
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["transaction_category", "Category"],
              ["structure", "Structure"],
              ["purchase_price", "Purchase price"],
              ["total_project_cost", "Total project cost"],
              ["real_estate_included", "Real estate included"],
              ["premises", "Premises"],
              ["franchise", "Franchise"],
              ["gift_funds", "Gift funds"],
              ["minority_investor_equity", "Minority investor equity"],
              ["target_lender", "Target lender"],
              ["expected_loan_number_date", "Expected loan number"],
              ["target_submission_date", "Target submission"],
            ].map(([key, label]) => (
              <div key={key}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-0.5">{term(key!)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {editable ? (
          <Card
            title="Edit profile"
            description="Saving re-evaluates the deal, so requirements and findings can change."
          >
            <details className="reveal">
              <summary>Open the editor</summary>
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
