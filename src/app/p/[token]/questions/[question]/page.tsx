import Link from "next/link";
import { notFound } from "next/navigation";
import { recipientData } from "@/lib/portal/service";
import { Shell } from "@/components/portal/Shell";
import { QuestionView } from "@/components/portal/QuestionView";
import { sourceUrl } from "@/lib/deals/source-url";
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ token: string; question: string }>;
}) {
  const { token, question } = await params,
    p = await recipientData(token),
    q = p.home.questions.find((q) => q.key === question);
  if (!q) notFound();
  const base = `/p/${token}`;
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.deal.contactName}
      email={p.deal.contactEmail}
      stages={p.home.stages}
      home={base}
    >
      <Link className="text-link" href={base}>
        Back to your list
      </Link>
      <QuestionView
        question={q}
        action={`${base}/action`}
        back={base}
        sourceLink={(v, page) =>
          `${base}/files/${v}?${sourceUrl(p.deal.id, v).split("?")[1]}#page=${page ?? 1}`
        }
      />
    </Shell>
  );
}
