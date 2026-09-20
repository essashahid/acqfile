import Link from "next/link";
import { notFound } from "next/navigation";
import { recipientData } from "@/lib/portal/service";
import { Shell } from "@/components/portal/Shell";
import { UploadForm } from "@/components/portal/UploadForm";
import { instructions, dateLabel, labelFor, periodLabel } from "@/lib/portal/copy";
export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; task: string }>;
  searchParams: Promise<{ replace?: string }>;
}) {
  const { token, task: key } = await params,
    p = await recipientData(token),
    task = p.home.tasks.find((t) => t.key === key),
    base = `/p/${token}`;
  if (!task) notFound();
  const { replace } = await searchParams;
  if (replace && !task.versions.includes(replace)) notFound();
  const help = instructions(task.type),
    files = p.data.versions.filter((v) => task.versions.includes(v.id));
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
      <h1>Your {task.title.toLowerCase()}</h1>
      {task.state === "To do" && files.length > 0 && (
        <div className="notice my-8">
          <h3>One thing to take another look at</h3>
          <p>{task.sentence}</p>
        </div>
      )}
      {files.length > 0 && (
        <section className="my-8">
          <h2>What you&apos;ve sent</h2>
          {files.map((v) => {
            const s = p.data.segments.find(
              (s) =>
                s.documentVersionId === v.id &&
                task.rows.some((r) => r.segments.some((e) => e.id === s.id)),
            );
            const row = task.rows.find((r) => r.segments.some((s) => s.versionId === v.id));
            const good = row?.status === "satisfied";
            return (
              <div
                className="row flex flex-col justify-between gap-3 sm:flex-row sm:items-center"
                key={v.id}
              >
                <div>
                  <h3>
                    {s?.period ? `${periodLabel(s.period)} ` : ""}
                    {labelFor(s?.docType ?? task.type)}
                  </h3>
                  <p className="muted">
                    {v.pageCount ? `${v.pageCount} ${v.pageCount === 1 ? "page" : "pages"}, ` : ""}
                    sent {dateLabel(v.createdAt)}
                  </p>
                  <p>
                    {good
                      ? "Looks good"
                      : task.state === "Done"
                        ? "We have what we need."
                        : row?.status === "received_with_issues"
                          ? task.sentence
                          : "With us for review"}
                  </p>
                </div>
                {!good && (
                  <Link className="button secondary" href={`${base}/tasks/${key}?replace=${v.id}`}>
                    Replace this file
                  </Link>
                )}
              </div>
            );
          })}
        </section>
      )}
      <div className="my-8 grid gap-6 sm:grid-cols-2">
        <section>
          <h2>Why we ask</h2>
          <p>{help.why}</p>
        </section>
        <section>
          <h2>What to upload</h2>
          <p>{help.what}</p>
        </section>
      </div>
      <UploadForm base={base} task={key} replace={replace} />
      <div className="flex flex-wrap gap-6">
        <Link className="text-link" href={`${base}/tasks/${key}/cant-send`}>
          I can&apos;t send this right now
        </Link>
        <a
          className="text-link"
          href={`mailto:${p.deal.contactEmail}?subject=${encodeURIComponent(task.title)}`}
        >
          Ask {p.deal.contactName.split(" ")[0]} a question
        </a>
      </div>
    </Shell>
  );
}
