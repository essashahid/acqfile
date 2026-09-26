import { availableCases } from "@/lib/demo/service";
import { env } from "@/lib/env";
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
  const demo = (await availableCases(ctx)).find((c) => c.seededDealId === dealId);
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
          // A badge means "look here", and an informational finding needs no action, so it is not
          // counted as work. The Review screen still lists it under "For information".
          findingsOpen: v.counts.findingsOpen - v.counts.informational,
          followUps: v.counts.followUpsToPrepare,
          versions: v.counts.versions,
        }));
  return (
    <div className="deal-shell">
      <DealRail dealId={dealId} code={deal.code} name={deal.name} counts={counts} />
      <div className="min-w-0">
        {demo ? (
          <aside className="mb-5 border-b pb-4" aria-label="Synthetic demo">
            <p className="eyebrow">
              Synthetic demo ·{" "}
              {env().LLM_PROVIDER === "mock"
                ? "Prepared sample extraction"
                : "Prepared seed; live reading of new synthetic files"}
            </p>
            <p>{demo.description}</p>
          </aside>
        ) : null}
        {children}
      </div>
    </div>
  );
}
