import { customerSourceUrl } from "@/lib/deals/source-url";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDeal } from "@/lib/deals/service";
import { adviserContext, portalData } from "@/lib/portal/service";
import { Shell, adviserStages } from "@/components/portal/Shell";
import { QuestionView } from "@/components/portal/QuestionView";
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ dealId: string; question: string }>;
}) {
  const { dealId, question } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  const p = await portalData(dealId),
    q = p.mapped.questions.find((q) => q.key === question);
  if (!q) notFound();
  const base = `/deals/${dealId}`;
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.data.deal.contactName}
      email={p.data.deal.contactEmail}
      stages={adviserStages(p.mapped.ready)}
    >
      <Link className="text-link" href={base}>
        Back to the deal
      </Link>
      <QuestionView
        question={q}
        action={`${base}/action`}
        back={base}
        sourceLink={(v, page) => `${customerSourceUrl(dealId, v)}#page=${page ?? 1}`}
      />
    </Shell>
  );
}
