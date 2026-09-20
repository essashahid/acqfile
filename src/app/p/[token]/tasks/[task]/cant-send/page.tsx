import Link from "next/link";
import { notFound } from "next/navigation";
import { recipientData } from "@/lib/portal/service";
import { Shell } from "@/components/portal/Shell";
import { ResponseForm } from "@/components/portal/ResponseForm";
export default async function CantSend({
  params,
}: {
  params: Promise<{ token: string; task: string }>;
}) {
  const { token, task: key } = await params,
    p = await recipientData(token),
    task = p.home.tasks.find((t) => t.key === key);
  if (!task) notFound();
  const base = `/p/${token}`;
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.deal.contactName}
      email={p.deal.contactEmail}
      stages={p.home.stages}
      home={base}
    >
      <Link className="text-link" href={`${base}/tasks/${key}`}>
        Back
      </Link>
      <p className="muted mt-5">Your {task.title.toLowerCase()}</p>
      <h1>Can&apos;t send this right now?</h1>
      <p>
        That&apos;s fine. Tell us what&apos;s going on and {p.deal.contactName.split(" ")[0]} will
        take it from there.
      </p>
      <ResponseForm
        action={`${base}/action`}
        task={key}
        kind="cant_send"
        contact={p.deal.contactName}
        back={base}
      />
    </Shell>
  );
}
