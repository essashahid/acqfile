import { requireWorkspace } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildDrafts, listRequests, ageInDays } from "@/lib/deliverables/requests";
import { sentAction } from "../../deliverable-actions";
import { CopyDraft } from "../../CopyDraft";
import { DeliverableNav } from "../DeliverableNav";
export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireWorkspace();
  await requireDeal(ctx, dealId);
  const drafts = await buildDrafts(ctx, dealId);
  const sent = await listRequests(dealId);
  return (
    <>
      <DeliverableNav dealId={dealId} />
      <h1>Requests</h1>
      <p>Drafts only. Nothing is sent by the system.</p>
      {drafts.map((d) => (
        <section className="border-b py-3" key={d.responsible}>
          <h2>{d.responsible}</h2>
          <pre className="whitespace-pre-wrap">{d.body}</pre>
          <CopyDraft body={d.body} />
          {mutationAllowed(ctx) && (
            <form action={sentAction.bind(null, dealId, d.responsible)}>
              <button>Mark as sent</button>
            </form>
          )}
        </section>
      ))}
      <h2>Sent history</h2>
      {sent.map((r) => (
        <p key={r.id}>
          {r.responsible} · {ageInDays(r.sentAt)} days · {r.findingKeys.length} findings
        </p>
      ))}
    </>
  );
}
