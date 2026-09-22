import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { adviserContext, portalData } from "@/lib/portal/service";
import { Shell, adviserStages } from "@/components/portal/Shell";
import { signOutAction } from "../actions";
export default async function Deals() {
  const ctx = await adviserContext();
  const deals = await getDb()
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.workspaceId, ctx.workspace.workspaceId));
  const all = await Promise.all(deals.map((d) => portalData(d.id)));
  return (
    <Shell
      firm={all[0]?.workspace.firmName ?? "Your adviser"}
      contact={all[0]?.data.deal.contactName ?? ctx.user.displayName}
      email={all[0]?.data.deal.contactEmail ?? ctx.user.email}
      stages={adviserStages()}
      account={ctx.user.email}
      signOut={signOutAction}
    >
      <h1>Your deals</h1>
      <p className="mb-9">See who needs your help and what happens next.</p>
      {all.map((p) => {
        const people = p.data.parties.filter((person) =>
          p.mapped.tasks.some((t) => t.partyId === person.id && t.state === "To do"),
        );
        return (
          <div
            className="row flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
            key={p.data.deal.id}
          >
            <div>
              <h3>{p.data.deal.name}</h3>
              <p>
                {people.length
                  ? `Waiting on ${people.map((p) => p.legalName).join(", ")}.`
                  : p.mapped.ready
                    ? "Prepared for lender review."
                    : "We're checking the documents."}
              </p>
            </div>
            <Link className="button primary" href={`/deals/${p.data.deal.id}`}>
              Open deal
            </Link>
          </div>
        );
      })}
    </Shell>
  );
}
