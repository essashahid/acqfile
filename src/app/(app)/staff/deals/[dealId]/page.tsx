import Link from "next/link";
import { AlertTriangle, ArrowRight, FileWarning, Info, ListChecks, Send } from "lucide-react";
import { requireStaff } from "@/lib/workspace";
import { readDeal } from "@/lib/deals/service";
import { dealView } from "@/lib/staff/deal-view";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

const MARK = {
  blocker: { icon: AlertTriangle, className: "text-[var(--bad,#9c2c34)]" },
  processing: { icon: FileWarning, className: "text-[var(--warn)]" },
  unresolved: { icon: ListChecks, className: "text-[var(--warn)]" },
  review: { icon: ListChecks, className: "text-[var(--accent)]" },
  "follow-up": { icon: Send, className: "text-[var(--accent)]" },
  info: { icon: Info, className: "text-[var(--muted)]" },
} as const;

export default async function DealOverview({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const { deal } = await readDeal(ctx, dealId);
  if (deal.rulePackVersion === "unknown")
    return (
      <>
        <PageHead title="Overview" subtitle="No rule pack is selected for this deal." />
        <Card>
          <Empty>
            Set the expected loan-number date on the deal profile so a rule pack can be resolved.
          </Empty>
        </Card>
      </>
    );
  const v = await dealView(dealId);
  const c = v.counts;
  const base = `/staff/deals/${dealId}`;
  const position = c.blockers
    ? `${c.blockers} blocker${c.blockers === 1 ? "" : "s"} prevent${c.blockers === 1 ? "s" : ""} a complete lender file.`
    : c.findingsOpen
      ? "No blockers. Open items remain before the file is complete under the configured checks."
      : c.required.done === c.required.applicable
        ? "Every applicable required requirement is satisfied or waived under the configured checks."
        : "No open findings. Some required requirements still have no accepted evidence.";
  const actionable = v.work.filter((w) => w.kind !== "info");
  const informational = v.work.filter((w) => w.kind === "info");
  return (
    <>
      <PageHead
        title="Overview"
        subtitle={position}
        actions={
          <Link className="btn" href={`${base}/lender-file`}>
            Lender file
          </Link>
        }
      />
      <div className="space-y-5">
        <Card
          title={actionable.length ? "What needs attention" : "Nothing needs attention"}
          description={
            actionable.length
              ? "Most consequential first. Each item opens the evidence behind it."
              : undefined
          }
          flush={actionable.length > 0}
        >
          {actionable.length ? (
            <ul>
              {actionable.map((w) => {
                const m = MARK[w.kind];
                return (
                  <li key={w.key} className="work">
                    <m.icon size={17} aria-hidden className={`work-mark ${m.className}`} />
                    <div className="min-w-0 flex-1">
                      <p className="work-title">{w.title}</p>
                      <p className="work-why">{w.why}</p>
                      <p className="meta mt-1">{w.party}</p>
                    </div>
                    <Link className="btn btn-sm self-center" href={w.href}>
                      {w.action}
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>
              No blockers, unresolved findings, unprocessed files or values awaiting a person.
            </Empty>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            title="Requirements"
            description="Applicable required requirements only."
            actions={
              <Link className="link" href={`${base}/requirements`}>
                Open
              </Link>
            }
          >
            <p className="text-[22px] font-semibold tabular-nums text-[var(--fg)]">
              {c.required.done} of {c.required.applicable}
            </p>
            <p className="meta">
              satisfied or waived · {c.notApplicable} not applicable, excluded from this count
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3">
              {[
                "satisfied",
                "waived",
                "received_with_issues",
                "missing",
                "needs_review",
                "tracking",
              ]
                .filter((s) => c.byStatus[s])
                .map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <Pill value={s} />
                    <span className="num font-semibold">{c.byStatus[s]}</span>
                  </li>
                ))}
            </ul>
          </Card>

          <Card
            title="Findings"
            description="Current findings. Resolved history is kept separately."
            actions={
              <Link className="link" href={`${base}/review`}>
                Open
              </Link>
            }
          >
            <p className="text-[22px] font-semibold tabular-nums text-[var(--fg)]">
              {c.findingsOpen} open
            </p>
            <p className="meta">
              {c.blockers} blocker{c.blockers === 1 ? "" : "s"} · {c.informational} informational ·{" "}
              {c.findingsTotal - c.findingsOpen} closed, in history
            </p>
            <p className="meta mt-4 border-t border-[var(--line)] pt-3">
              {c.followUpsToPrepare
                ? `${c.followUpsToPrepare} open item${c.followUpsToPrepare === 1 ? " has" : "s have"} no follow-up recorded as sent.`
                : c.requestsRecorded
                  ? `${c.requestsRecorded} follow-up${c.requestsRecorded === 1 ? "" : "s"} recorded as sent${c.oldestRequestDays !== null ? `, oldest ${c.oldestRequestDays} days ago` : ""}.`
                  : "No follow-ups recorded as sent."}
            </p>
          </Card>

          <Card
            title="Documents"
            description="Source files that arrived, and the documents filed from them."
            actions={
              <Link className="link" href={`${base}/documents`}>
                Open
              </Link>
            }
          >
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <p className="text-[22px] font-semibold tabular-nums text-[var(--fg)]">
                  {c.arrivals}
                </p>
                <p className="meta">source files received</p>
              </div>
              <div>
                <p className="text-[22px] font-semibold tabular-nums text-[var(--fg)]">{c.filed}</p>
                <p className="meta">documents filed from them</p>
              </div>
              <div>
                <p className="text-[22px] font-semibold tabular-nums text-[var(--fg)]">
                  {c.documentsNeedingAttention}
                </p>
                <p className="meta">need attention</p>
              </div>
            </div>
            <p className="meta mt-4 border-t border-[var(--line)] pt-3">
              A filed document is not by itself a satisfied requirement.
            </p>
          </Card>

          <Card
            title="Evaluation"
            description={
              v.evaluation
                ? `Last run ${v.evaluation.createdAt.toISOString().replace("T", " ").slice(0, 16)}`
                : "Not evaluated yet"
            }
          >
            <p className="meta">
              Rule pack {v.pack.version} · overlay {v.pack.overlay ?? "base"} · as of{" "}
              {deal.asOfDate}
            </p>
            <p className="meta mt-2">
              {c.pendingValues
                ? `${c.pendingValues} extracted value${c.pendingValues === 1 ? "" : "s"} await a person.`
                : "No extracted values await confirmation."}
            </p>
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px]">
              Every rule in this pack is unverified: no lender has confirmed it.{" "}
              <Link className="link" href={`${base}/profile`}>
                Profile and rules
              </Link>
            </p>
          </Card>
        </div>

        {informational.length ? (
          <Card
            title="For information"
            description="Recorded context. The current rules do not require a document for these."
            flush
          >
            <ul>
              {informational.map((w) => (
                <li key={w.key} className="work">
                  <Info size={17} aria-hidden className="work-mark text-[var(--muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="work-title">{w.title}</p>
                    <p className="meta mt-1">{w.party}</p>
                  </div>
                  <Link className="link self-center" href={w.href}>
                    {w.action}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
