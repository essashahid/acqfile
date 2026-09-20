import type { ReactNode } from "react";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { dealView } from "@/lib/staff/deal-view";
import { DealRail } from "@/components/staff/DealRail";

/** One rail for the whole deal, so no screen stacks a second navigation bar on top of it. */
export default async function DealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  const deal = await requireDeal(ctx, dealId);
  const counts =
    deal.rulePackVersion === "unknown"
      ? {
          attention: 0,
          requirementsOpen: 0,
          findingsOpen: 0,
          followUps: 0,
          versions: 0,
        }
      : await dealView(dealId).then((v) => ({
          attention: v.counts.documentsNeedingAttention,
          requirementsOpen:
            (v.counts.byStatus.missing ?? 0) +
            (v.counts.byStatus.received_with_issues ?? 0) +
            (v.counts.byStatus.needs_review ?? 0),
          findingsOpen: v.counts.findingsOpen,
          followUps: v.counts.followUpsToPrepare,
          versions: v.counts.versions,
        }));
  return (
    <div className="deal-shell">
      <DealRail dealId={dealId} code={deal.code} name={deal.name} counts={counts} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
