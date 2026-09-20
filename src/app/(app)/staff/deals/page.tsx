import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { mutationAllowed } from "@/lib/access";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

export default async function DealsPage() {
  const ctx = await requireStaff();
  const deals = await getDb()
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.workspaceId, ctx.workspace.workspaceId))
    .orderBy(desc(schema.deals.createdAt));
  return (
    <>
      <PageHead
        title="Deals"
        subtitle={`${deals.length} ${deals.length === 1 ? "deal" : "deals"} in ${ctx.workspace.name}. Every rule is unverified.`}
        actions={
          mutationAllowed(ctx) ? (
            <Link className="btn btn-primary" href="/staff/deals/new">
              Create deal
            </Link>
          ) : null
        }
      />
      <Card flush>
        {deals.length ? (
          <table className="grid">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Status</th>
                <th>Rule pack</th>
                <th>Overlay</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link className="link font-semibold" href={`/staff/deals/${d.id}`}>
                      {d.code}
                    </Link>
                    <p className="meta">{d.name}</p>
                  </td>
                  <td>
                    <Pill value={d.status} />
                  </td>
                  <td className="num">{d.rulePackVersion}</td>
                  <td>{d.overlayId ?? "Base"}</td>
                  <td className="num">{d.asOfDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            <Empty>No deals yet. Create one to begin collecting documents.</Empty>
          </div>
        )}
      </Card>
    </>
  );
}
