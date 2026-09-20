import { sourceUrl } from "@/lib/deals/source-url";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { listSnapshots, type SnapshotDiff } from "@/lib/deliverables/snapshot";
import { snapshotAction } from "../../deliverable-actions";
import { DeliverableNav } from "../DeliverableNav";
export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireWorkspace();
  await requireDeal(ctx, dealId);
  const snapshots = await listSnapshots(dealId);
  return (
    <>
      <DeliverableNav dealId={dealId} />
      <h1>Package</h1>
      {mutationAllowed(ctx) && (
        <form action={snapshotAction.bind(null, dealId)}>
          <button>Generate snapshot</button>
        </form>
      )}
      {snapshots.map((s) => (
        <section key={s.id}>
          <h2>Snapshot {s.number}</h2>
          {originalAccessAllowed(ctx) && (
            <Link
              href={sourceUrl(dealId, s.id).replace(`/files/${s.id}/source`, `/package/${s.id}`)}
              className="underline"
            >
              Download ZIP {s.number}
            </Link>
          )}
          <table>
            <tbody>
              {Object.entries(s.diffJson as SnapshotDiff).map(([k, v]) => (
                <tr key={k}>
                  <th>{k.replaceAll("_", " ")}</th>
                  <td>{Array.isArray(v) ? v.join("; ") || "none" : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
