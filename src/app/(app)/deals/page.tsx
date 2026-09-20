import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireWorkspace } from "@/lib/workspace";
import { mutationAllowed } from "@/lib/access";
export default async function DealsPage() {
  const ctx = await requireWorkspace();
  const deals = await getDb()
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.workspaceId, ctx.workspace.workspaceId))
    .orderBy(desc(schema.deals.createdAt));
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Deals</h1>
        {mutationAllowed(ctx) && (
          <Link className="underline" href="/deals/new">
            Create deal
          </Link>
        )}
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Status</th>
            <th>Rule pack (unverified)</th>
            <th>Overlay</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b">
              <td className="py-3">
                <Link className="underline" href={`/deals/${d.id}`}>
                  {d.code} · {d.name}
                </Link>
              </td>
              <td>{d.status}</td>
              <td>{d.rulePackVersion}</td>
              <td>{d.overlayId ?? "Base"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!deals.length && <p>No deals yet.</p>}
    </div>
  );
}
