import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildIndex } from "@/lib/deliverables/index-build";
import { decisionAction } from "../../deliverable-actions";
import { DeliverableNav } from "../DeliverableNav";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dealId } = await params;
  const q = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const b = await buildIndex(dealId);
  const filters = ["type", "severity", "responsibleRole", "status"] as const;
  return (
    <>
      <DeliverableNav dealId={dealId} />
      <h1>Findings</h1>
      <form>
        {filters.map((k) => (
          <label key={k}>
            {k === "responsibleRole" ? "Responsible party" : k}
            <select name={k} defaultValue={q[k] ?? ""}>
              <option value="">All</option>
              {[...new Set(b.findings.map((f) => f[k]))].sort().map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <button>Filter</button>
      </form>
      {b.findings
        .filter((f) => filters.every((k) => !q[k] || f[k] === q[k]))
        .sort((a, c) => Number(c.severity === "blocker") - Number(a.severity === "blocker"))
        .map((f) => {
          const d = f.detailsJson as {
            message: string;
            details: { value: unknown; file: string; page: number | null; quote: string }[];
          };
          return (
            <section key={f.id} className="border-b py-3">
              <h2>
                {f.ruleId} · {f.type} · {f.severity} · {f.status}
              </h2>
              <p>
                {b.partyName(f.scopeKey)} {f.period} · Responsible: {f.responsibleRole} · Rule
                unverified
              </p>
              <p>{d.message}</p>
              <div className="flex gap-4">
                {d.details.map((s, i) => (
                  <div key={i}>
                    <p>{typeof s.value === "string" ? s.value : JSON.stringify(s.value)}</p>
                    <p>
                      {b.versions.some((v) => v.id === s.file) ? b.originalPath(s.file) : s.file} ·
                      page {s.page ?? "—"}
                    </p>
                    <blockquote>“{s.quote}”</blockquote>
                  </div>
                ))}
              </div>
              {!!f.resolvedByJson && (
                <p>
                  Resolved by:{" "}
                  {((f.resolvedByJson as { segment_ids: string[] }).segment_ids ?? []).map((id) => {
                    const segment = b.segments.find((s) => s.id === id);
                    return segment ? (
                      <Link
                        key={id}
                        className="underline mr-2"
                        href={`/staff/deals/${dealId}/files/${segment.documentVersionId}?page=${segment.pageStart}`}
                      >
                        {segment.docType} · {b.originalPath(segment.documentVersionId)}, page{" "}
                        {segment.pageStart}
                      </Link>
                    ) : null;
                  })}
                </p>
              )}
              {f.reason && <p>Reason: {f.reason}</p>}
              {mutationAllowed(ctx) && (
                <form action={decisionAction.bind(null, dealId)}>
                  <input type="hidden" name="finding_key" value={f.findingKey} />
                  <input name="reason" aria-label="Decision reason" required />
                  <button name="action" value="dismiss">
                    Dismiss
                  </button>
                  <button name="action" value="waive">
                    Waive
                  </button>
                </form>
              )}
            </section>
          );
        })}
    </>
  );
}
