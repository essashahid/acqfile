import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import { sourceUrl } from "@/lib/deals/source-url";
import { dealView } from "@/lib/staff/deal-view";
import type { SnapshotContent, SnapshotDiff } from "@/lib/deliverables/snapshot";
import { snapshotAction } from "../../deliverable-actions";
import { CreateVersion } from "../../CreateVersion";
import { Card, Empty, PageHead } from "@/components/staff";

const DIFF_LABEL: Record<keyof SnapshotDiff, string> = {
  newly_satisfied: "Requirements newly satisfied",
  new_findings: "New findings",
  resolved_findings: "Findings resolved",
  documents_added: "Documents added",
  documents_superseded: "Documents replaced",
  reviewer_corrections: "Operator corrections",
  dismissals: "Findings dismissed",
  waivers: "Requirements waived",
};

export default async function LenderFile({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const c = v.counts;
  const editable = mutationAllowed(ctx);
  const canDownload = originalAccessAllowed(ctx);
  const complete = c.required.done === c.required.applicable && c.blockers === 0;
  const selected = (await searchParams).version;
  const latest = v.snapshots.find((s) => String(s.number) === selected) ?? v.snapshots[0];
  return (
    <>
      <PageHead
        title="Lender file"
        subtitle="The organised set of documents and review results you hand to the lender. Creating or downloading a version does not send it anywhere."
      />
      <div className="space-y-5">
        <Card title="Preparation status">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`pill ${complete ? "pill-ok" : "pill-warn"}`}>
              {complete ? "Meets the configured checks" : "Work outstanding"}
            </span>
            <p className="meta">
              Meeting the configured checks is not lender approval, nor a credit, legal, tax or
              eligibility determination.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="eyebrow">Required requirements</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums">
                {c.required.done} of {c.required.applicable}
              </p>
              <p className="meta">satisfied or waived</p>
            </div>
            <div>
              <p className="eyebrow">Blockers</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums">{c.blockers}</p>
              <p className="meta">
                {c.blockers ? "must be resolved, dismissed or waived" : "none"}
              </p>
            </div>
            <div>
              <p className="eyebrow">Documents to include</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums">{c.filed}</p>
              <p className="meta">filed and current</p>
            </div>
          </div>
          {!complete ? (
            <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
              {v.work
                .filter((w) => w.kind === "blocker" || w.kind === "unresolved")
                .slice(0, 5)
                .map((w) => (
                  <li key={w.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`pill ${w.kind === "blocker" ? "pill-bad" : "pill-warn"}`}>
                      {w.kind === "blocker" ? "Blocker" : "Open"}
                    </span>
                    <Link className="link" href={w.href}>
                      {w.title}
                    </Link>
                    <span className="meta">{w.party}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          {editable ? (
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <CreateVersion action={snapshotAction.bind(null, dealId)} complete={complete} />
              <p className="meta mt-2">
                Each version preserves the documents and review results from the time it was
                created. Later changes never alter a version that already exists.
              </p>
            </div>
          ) : null}
        </Card>

        {latest ? (
          <Card
            title={`Version ${latest.number}`}
            description={`Created ${latest.createdAt.toISOString().replace("T", " ").slice(0, 16)}`}
            actions={
              canDownload ? (
                <Link
                  className="btn btn-primary btn-sm"
                  href={sourceUrl(dealId, latest.id).replace(
                    `/files/${latest.id}/source`,
                    `/lender-file/${latest.id}`,
                  )}
                >
                  Download ZIP
                </Link>
              ) : (
                <span className="meta">Downloads need the admin or operator role.</span>
              )
            }
          >
            {(() => {
              const content = latest.contentJson as SnapshotContent;
              const diff = latest.diffJson as SnapshotDiff;
              return (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="eyebrow">Requirements at that time</p>
                      <p className="mt-1 text-[20px] font-semibold tabular-nums">
                        {content.readiness.satisfied} of {content.readiness.applicable}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">Documents included</p>
                      <p className="mt-1 text-[20px] font-semibold tabular-nums">
                        {content.manifest.length}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">Index rows</p>
                      <p className="mt-1 text-[20px] font-semibold tabular-nums">
                        {content.index.length}
                      </p>
                    </div>
                  </div>
                  <p className="meta mt-4">
                    Contains a printable report, a workbook of the index, missing items, conflicts
                    and the source record, and a folder of renamed original copies. Identifiers are
                    masked in generated reports; originals retain their supplied contents.
                  </p>
                  <div className="mt-4 border-t border-[var(--line)] pt-4">
                    <p className="eyebrow mb-2">Changed since the previous version</p>
                    <ul className="space-y-1.5">
                      {(Object.keys(DIFF_LABEL) as (keyof SnapshotDiff)[]).map((k) => {
                        const value = diff[k];
                        const empty = Array.isArray(value) ? !value.length : !value;
                        if (empty) return null;
                        return (
                          <li key={k}>
                            <span className="font-medium">{DIFF_LABEL[k]}:</span>{" "}
                            <span className="meta">
                              {Array.isArray(value)
                                ? value
                                    .map((entry) =>
                                      entry.replace(
                                        /^[A-Z]+-\d+[a-z]?/,
                                        (id) => v.rules.get(id)?.title ?? id,
                                      ),
                                    )
                                    .join("; ")
                                : value}
                            </span>
                          </li>
                        );
                      })}
                      {(Object.keys(DIFF_LABEL) as (keyof SnapshotDiff)[]).every((k) => {
                        const value = diff[k];
                        return Array.isArray(value) ? !value.length : !value;
                      }) ? (
                        <li className="meta">Nothing changed since the previous version.</li>
                      ) : null}
                    </ul>
                  </div>
                  <details className="reveal mt-4">
                    <summary>Included files and original details</summary>
                    <table className="grid mt-2">
                      <thead>
                        <tr>
                          <th>Package path</th>
                          <th>Original file</th>
                          <th>SHA-256</th>
                        </tr>
                      </thead>
                      <tbody>
                        {content.manifest.map((m) => (
                          <tr key={m.package_path}>
                            <td className="break-words">{m.package_path}</td>
                            <td className="break-words meta">{m.original_filename}</td>
                            <td className="num" title={m.sha256}>
                              {m.sha256.slice(0, 12)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              );
            })()}
          </Card>
        ) : (
          <Card title="No version yet">
            <Empty>
              No lender-file version has been created for this deal. Creating one freezes the
              current documents and review results so they can be handed over and referred back to.
            </Empty>
          </Card>
        )}

        {v.snapshots.length > 1 ? (
          <Card title="Other versions" description="Earlier versions never change." flush>
            <table className="grid">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Created</th>
                  <th>Requirements</th>
                  <th>Documents</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {v.snapshots
                  .filter((s) => s.id !== latest?.id)
                  .map((s) => {
                    const content = s.contentJson as SnapshotContent;
                    return (
                      <tr key={s.id}>
                        <td className="num font-medium">
                          <Link className="link" href={`?version=${s.number}`}>
                            Version {s.number}
                          </Link>
                        </td>
                        <td className="num">{s.createdAt.toISOString().slice(0, 10)}</td>
                        <td className="num">
                          {content.readiness.satisfied} of {content.readiness.applicable}
                        </td>
                        <td className="num">{content.manifest.length}</td>
                        <td>
                          {canDownload ? (
                            <Link
                              className="link"
                              href={sourceUrl(dealId, s.id).replace(
                                `/files/${s.id}/source`,
                                `/lender-file/${s.id}`,
                              )}
                            >
                              ZIP
                            </Link>
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
