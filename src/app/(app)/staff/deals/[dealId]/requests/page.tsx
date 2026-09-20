import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildDrafts, listRequests, ageInDays } from "@/lib/deliverables/requests";
import { sentAction } from "../../deliverable-actions";
import { CopyDraft } from "../../CopyDraft";
import { Card, DealTabs, Empty, PageHead } from "@/components/staff";

export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const deal = await requireDeal(ctx, dealId);
  const drafts = await buildDrafts(ctx, dealId);
  const sent = await listRequests(dealId);
  const editable = mutationAllowed(ctx);
  return (
    <>
      <PageHead
        eyebrow={deal.code}
        title="Requests"
        subtitle="Drafts you copy and send yourself. The system never sends anything."
      />
      <DealTabs dealId={dealId} current="requests" />
      <div className="space-y-5">
        {drafts.map((d) => (
          <Card
            key={d.responsible}
            title={d.responsible}
            description={`${d.findingKeys.length} open ${d.findingKeys.length === 1 ? "item" : "items"}`}
            actions={
              <>
                <CopyDraft body={d.body} />
                {editable ? (
                  <form action={sentAction.bind(null, dealId, d.responsible)}>
                    <button className="btn btn-primary btn-sm">Mark as sent</button>
                  </form>
                ) : null}
              </>
            }
          >
            <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 font-sans text-[13.5px] leading-6">
              {d.body}
            </pre>
          </Card>
        ))}
        {!drafts.length ? (
          <Card>
            <Empty>No open findings, so there is nothing to ask for.</Empty>
          </Card>
        ) : null}

        <Card title="Sent history" flush={sent.length > 0}>
          {sent.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Marked sent</th>
                  <th>Age</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.responsible}</td>
                    <td className="num">{r.sentAt?.toISOString().slice(0, 10) ?? "—"}</td>
                    <td className="num">{ageInDays(r.sentAt)} days</td>
                    <td className="num">{r.findingKeys.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nothing marked as sent yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
