import Link from "next/link";
import { recipientData } from "@/lib/portal/service";
import { Shell } from "@/components/portal/Shell";
import { TaskRows } from "@/components/portal/TaskRows";
import { dateLabel } from "@/lib/portal/copy";
export const dynamic = "force-dynamic";
export default async function Home({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params,
    p = await recipientData(token, true),
    h = p.home,
    base = `/p/${token}`;
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.deal.contactName}
      email={p.deal.contactEmail}
      stages={h.stages}
      home={base}
    >
      <p className="muted">Buying {p.deal.name}</p>
      <h1>{h.headline}</h1>
      {p.firstVisit && (
        <p className="mb-5">
          {p.deal.contactName} has asked for these documents to prepare your loan file. You can
          leave and come back whenever you need.
        </p>
      )}
      <p className="mb-9">
        {h.state === "todo"
          ? "Everything else is done or with us for review."
          : h.state === "waiting"
            ? "We're checking the documents you sent. If anything is unclear we'll ask. Otherwise they move to done."
            : "Thank you. We have what we need from you. There is nothing you need to do today."}
        {p.deal.sendBy && h.state === "todo"
          ? ` Please send these by ${dateLabel(p.deal.sendBy)}.`
          : ""}
      </p>
      {h.questions.map((q) => (
        <div className="row" key={q.key}>
          <h3>{q.title}</h3>
          <Link className="button primary mt-3" href={`${base}/questions/${q.key}`}>
            Answer
          </Link>
        </div>
      ))}
      {h.todo.length > 0 && (
        <section>
          <h2 className="mb-3">To do</h2>
          {h.todo.length > 6 ? (
            <>
              {[false, true].map((b) => (
                <div key={String(b)}>
                  <h2>{b ? "About the business" : "About you"}</h2>
                  <TaskRows tasks={h.todo.filter((t) => t.business === b)} base={base} />
                </div>
              ))}
            </>
          ) : (
            <TaskRows tasks={h.todo} base={base} />
          )}
        </section>
      )}
      {h.waiting.length > 0 && (
        <section className="mt-8">
          <h2>With us for review</h2>
          <TaskRows tasks={h.waiting} base={base} />
        </section>
      )}
      {h.done.length > 0 && (
        <details className="row mt-6">
          <summary className="cursor-pointer font-semibold">
            Your completed documents <span className="text-link float-right">Show</span>
          </summary>
          <TaskRows tasks={h.done} base={base} />
        </details>
      )}
      <section className="aside-panel mt-9">
        <h2>What happens next</h2>
        <p className="mt-2">
          When the documents are in, we check everything together and prepare one complete file for
          the lender. If anything more is needed, your adviser will contact you. Done means we have
          what we need from you. The decision on the loan belongs to the lender.
        </p>
      </section>
    </Shell>
  );
}
