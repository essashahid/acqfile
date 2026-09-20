import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildIndex } from "@/lib/deliverables/index-build";
import { decisionAction } from "../../deliverable-actions";
import { Card, DealTabs, Empty, formatValue, PageHead, Pill } from "@/components/staff";

const LABEL: Record<string, string> = {
  type: "Type",
  severity: "Severity",
  responsibleRole: "Responsible party",
  status: "Status",
};

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
  const deal = await requireDeal(ctx, dealId);
  const b = await buildIndex(dealId);
  const editable = mutationAllowed(ctx);
  const filters = ["type", "severity", "responsibleRole", "status"] as const;
  const shown = b.findings
    .filter((f) => filters.every((k) => !q[k] || f[k] === q[k]))
    .sort(
      (a, c) =>
        Number(c.severity === "blocker") - Number(a.severity === "blocker") ||
        Number(["open", "requested"].includes(c.status)) -
          Number(["open", "requested"].includes(a.status)) ||
        a.ruleId.localeCompare(c.ruleId),
    );
  const open = b.findings.filter((f) => ["open", "requested"].includes(f.status)).length;
  return (
    <>
      <PageHead
        eyebrow={deal.code}
        title="Findings"
        subtitle={`${open} open or requested of ${b.findings.length}. A finding states what the documents show, never what the lender should decide.`}
      />
      <DealTabs dealId={dealId} current="findings" />
      <div className="space-y-5">
        <Card>
          <form className="flex flex-wrap items-end gap-3">
            {filters.map((k) => (
              <label key={k} className="flex min-w-[9rem] flex-col gap-1">
                <span className="eyebrow">{LABEL[k]}</span>
                <select name={k} defaultValue={q[k] ?? ""}>
                  <option value="">All</option>
                  {[...new Set(b.findings.map((f) => f[k]))].sort().map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <button className="btn">Filter</button>
            {filters.some((k) => q[k]) ? (
              <Link className="link" href={`/staff/deals/${dealId}/findings`}>
                Clear
              </Link>
            ) : null}
            <span className="meta ml-auto self-center">
              {shown.length} of {b.findings.length} shown
            </span>
          </form>
        </Card>

        {shown.map((f) => {
          const d = f.detailsJson as {
            message: string;
            details: { value: unknown; file: string; page: number | null; quote: string }[];
          };
          const sides = d.details.filter((s) => s.page !== null);
          return (
            <Card key={f.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="text-[17px]">
                    {f.ruleId} ·{" "}
                    {b.partyName(f.scopeKey) === "Unassigned"
                      ? f.scopeKey
                      : b.partyName(f.scopeKey)}
                    {f.period ? ` · ${f.period}` : ""}
                  </h2>
                  <p className="meta mt-1">Responsible: {f.responsibleRole} · rule unverified</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill value={f.type} />
                  <Pill value={f.severity} />
                  <Pill value={f.status} />
                </div>
              </div>
              <p className="mt-3 break-words">{d.message}</p>

              {sides.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sides.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3"
                    >
                      <p className="font-semibold break-words">{formatValue(s.value)}</p>
                      <p className="meta mt-1 break-words">
                        {b.versions.some((v) => v.id === s.file) ? b.originalPath(s.file) : s.file}
                        {s.page !== null ? ` · page ${s.page}` : ""}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-[var(--line-strong)] pl-2.5 text-[13px] italic break-words">
                        {s.quote}
                      </blockquote>
                    </div>
                  ))}
                </div>
              ) : null}

              {f.resolvedByJson ? (
                <p className="mt-3">
                  <span className="eyebrow">Resolved by</span>{" "}
                  {((f.resolvedByJson as { segment_ids: string[] }).segment_ids ?? []).map((id) => {
                    const segment = b.segments.find((s) => s.id === id);
                    return segment ? (
                      <Link
                        key={id}
                        className="link mr-3"
                        href={`/staff/deals/${dealId}/files/${segment.documentVersionId}?page=${segment.pageStart}`}
                      >
                        {segment.docType} · {b.originalPath(segment.documentVersionId)}, page{" "}
                        {segment.pageStart}
                      </Link>
                    ) : null;
                  })}
                </p>
              ) : null}
              {f.reason ? (
                <p className="meta mt-2">
                  <span className="eyebrow">Reason</span> {f.reason}
                </p>
              ) : null}

              {editable && ["open", "requested"].includes(f.status) ? (
                <form
                  action={decisionAction.bind(null, dealId)}
                  className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4"
                >
                  <input type="hidden" name="finding_key" value={f.findingKey} />
                  <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
                    <span className="eyebrow">Reason (required)</span>
                    <input name="reason" aria-label="Decision reason" required />
                  </label>
                  <button className="btn" name="action" value="dismiss">
                    Dismiss
                  </button>
                  <button className="btn" name="action" value="waive">
                    Waive
                  </button>
                </form>
              ) : null}
            </Card>
          );
        })}

        {!shown.length ? (
          <Card>
            <Empty>
              {b.findings.length
                ? "No findings match these filters."
                : "No findings. Evaluate the deal after documents arrive."}
            </Empty>
          </Card>
        ) : null}
      </div>
    </>
  );
}
