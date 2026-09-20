import Link from "next/link";
import { sourceUrl } from "@/lib/deals/source-url";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { listSnapshots, type SnapshotDiff } from "@/lib/deliverables/snapshot";
import { snapshotAction } from "../../deliverable-actions";
import { Card, DealTabs, Empty, PageHead } from "@/components/staff";

const DIFF_LABEL: Record<string, string> = {
  newly_satisfied: "Newly satisfied",
  new_findings: "New findings",
  resolved_findings: "Resolved findings",
  documents_added: "Documents added",
  documents_superseded: "Documents superseded",
  reviewer_corrections: "Reviewer corrections",
  dismissals: "Dismissals",
  waivers: "Waivers",
};

export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const deal = await requireDeal(ctx, dealId);
  const snapshots = await listSnapshots(dealId);
  const canDownload = originalAccessAllowed(ctx);
  return (
    <>
      <PageHead
        eyebrow={deal.code}
        title="Lender file"
        subtitle="A snapshot freezes the evaluation, the index and the file hashes. Snapshots are numbered and never change."
        actions={
          mutationAllowed(ctx) ? (
            <form action={snapshotAction.bind(null, dealId)}>
              <button className="btn btn-primary">Generate snapshot</button>
            </form>
          ) : null
        }
      />
      <DealTabs dealId={dealId} current="package" />
      <div className="space-y-5">
        {snapshots.map((s) => {
          const diff = s.diffJson as SnapshotDiff;
          return (
            <Card
              key={s.id}
              title={`Snapshot ${s.number}`}
              description={s.createdAt.toISOString().replace("T", " ").slice(0, 16)}
              actions={
                canDownload ? (
                  <Link
                    className="btn btn-sm"
                    href={sourceUrl(dealId, s.id).replace(
                      `/files/${s.id}/source`,
                      `/package/${s.id}`,
                    )}
                  >
                    Download ZIP
                  </Link>
                ) : null
              }
              flush
            >
              <table className="grid">
                <thead>
                  <tr>
                    <th className="w-[22%]">Change since previous</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(diff).map(([k, v]) => (
                    <tr key={k}>
                      <td className="font-medium">{DIFF_LABEL[k] ?? k.replaceAll("_", " ")}</td>
                      <td>
                        {Array.isArray(v) ? (
                          v.length ? (
                            <ul className="space-y-0.5">
                              {v.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="meta">none</span>
                          )
                        ) : (
                          <span className="num">{v}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
        {!snapshots.length ? (
          <Card>
            <Empty>
              No snapshots yet. Generate one to freeze the current evaluation and produce the ZIP.
            </Empty>
          </Card>
        ) : null}
      </div>
    </>
  );
}
