import Link from "next/link";
import { availableCases } from "@/lib/demo/service";
import { DemoCaseSelector } from "@/components/staff/DemoCaseSelector";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { staffFocus } from "@/lib/staff/roles";
import { Card, Empty, PageHead } from "@/components/staff";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireStaff();
  const cases = await availableCases(ctx);
  const deals = await getDb()
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.workspaceId, ctx.workspace.workspaceId))
    .orderBy(desc(schema.deals.createdAt));
  const query = (await searchParams).q?.trim() ?? "";
  const focus = staffFocus(ctx.workspace.role);
  const rows = await Promise.all(
    deals
      .filter((d) => d.status !== "archived")
      .filter((d) => !query || `${d.name} ${d.code}`.toLowerCase().includes(query.toLowerCase()))
      .map(async (deal) => ({
        deal,
        view: deal.rulePackVersion === "unknown" ? null : await dealView(deal.id),
      })),
  );
  return (
    <>
      <PageHead
        title={focus.title}
        subtitle={focus.description}
        actions={
          mutationAllowed(ctx) ? (
            <Link className="btn btn-primary" href="/staff/deals/new">
              Create deal
            </Link>
          ) : null
        }
      />
      {cases.length ? (
        <DemoCaseSelector cases={cases.map(({ id, label }) => ({ id, label }))} />
      ) : null}
      <form className="mb-5 flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Find a deal</span>
          <input name="q" placeholder="Business name or deal code" defaultValue={query} />
        </label>
        <button className="btn">Search</button>
        {query ? (
          <Link className="link" href="/staff/deals">
            Clear
          </Link>
        ) : null}
      </form>
      <Card flush>
        {rows.length ? (
          <table className="grid">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Current work</th>
                <th>Evidence coverage</th>
                <th>Last checked</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal: d, view: v }) => (
                <tr key={d.id}>
                  <td>
                    <Link className="link font-semibold" href={`/staff/deals/${d.id}`}>
                      {d.name}
                    </Link>
                    <p className="meta">{d.code}</p>
                  </td>
                  <td>
                    {v ? (
                      <>
                        <p>
                          {v.counts.blockers} blockers ·{" "}
                          {v.counts.findingsOpen - v.counts.informational} actionable findings
                        </p>
                        <p className="meta">
                          {v.counts.documentsNeedingAttention} source files need attention
                        </p>
                      </>
                    ) : (
                      "Choose a rule pack"
                    )}
                  </td>
                  <td>
                    {v ? (
                      <>
                        <p>
                          {v.counts.required.done} of {v.counts.required.applicable} preparation
                          requirements
                        </p>
                        <p className="meta">
                          Satisfied or waived · {v.counts.notApplicable} excluded
                        </p>
                      </>
                    ) : (
                      "Not checked yet"
                    )}
                  </td>
                  <td className="num">
                    {v?.evaluation?.createdAt.toISOString().slice(0, 10) ?? "Not checked"}
                  </td>
                  <td>
                    <Link
                      className="btn btn-sm"
                      href={`/staff/deals/${d.id}${v ? focus.entry : "/profile"}`}
                    >
                      {focus.action}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            <Empty>
              {query
                ? "No deals match your search. Try a business name or clear the search."
                : "No deals are available in this workspace yet."}
            </Empty>
          </div>
        )}
      </Card>
    </>
  );
}
