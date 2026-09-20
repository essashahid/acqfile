import Link from "next/link";
import { requireDeal } from "@/lib/deals/service";
import { adviserContext, portalData } from "@/lib/portal/service";
import { Shell, adviserStages } from "@/components/portal/Shell";
import { signOutAction } from "../../../actions";
export default async function Documents({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  const p = await portalData(dealId);
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.data.deal.contactName}
      email={p.data.deal.contactEmail}
      stages={adviserStages(p.mapped.ready)}
      account={ctx.user.email}
      signOut={signOutAction}
    >
      <Link className="text-link" href={`/deals/${dealId}`}>
        Back to the deal
      </Link>
      <h1>Every document</h1>
      {["To do", "With us for review", "Done"].map((state) => (
        <section className="mt-9" key={state}>
          <h2>{state}</h2>
          {p.mapped.tasks
            .filter((t) => t.state === state)
            .map((t) => (
              <div className="row" key={t.key}>
                <h3>{t.title}</h3>
                <p className="muted">{p.data.partyName(t.partyId)}</p>
                <p>{t.sentence}</p>
              </div>
            ))}
        </section>
      ))}
    </Shell>
  );
}
