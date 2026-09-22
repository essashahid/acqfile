import { listSnapshots, type SnapshotContent } from "@/lib/deliverables/snapshot";
import { sourceUrl } from "@/lib/deals/source-url";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireDeal } from "@/lib/deals/service";
import { adviserContext, portalData, latestReminder } from "@/lib/portal/service";
import { personHome } from "@/lib/portal/map";
import { dateLabel, numberWord } from "@/lib/portal/copy";
import { Shell, adviserStages } from "@/components/portal/Shell";
import { signOutAction } from "../../actions";
import { AdviserAction } from "@/components/portal/AdviserActions";
export default async function Overview({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params,
    ctx = await adviserContext();
  await requireDeal(ctx, dealId);
  const [p, snapshots] = await Promise.all([portalData(dealId), listSnapshots(dealId)]);
  const base = `/deals/${dealId}`,
    deal = p.data.deal;
  const preparedVersions = snapshots.filter(
    (version) => (version.contentJson as SnapshotContent).preparation?.ready,
  );
  const people = p.data.parties
    .map((person) => ({ person, home: personHome(p.mapped, person.id, person.legalName) }))
    .filter((p) => p.home.tasks.length);
  const waiting = people.filter((p) => p.home.todo.length).length,
    questions = p.mapped.openQuestions.filter((q) => !q.partyId);
  const links = await getDb()
    .select()
    .from(schema.portalLinks)
    .where(and(eq(schema.portalLinks.dealId, dealId), isNull(schema.portalLinks.revoked)));
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={deal.contactName}
      email={deal.contactEmail}
      stages={adviserStages(p.mapped.ready)}
      account={ctx.user.email}
      signOut={signOutAction}
    >
      <Link className="text-link" href="/deals">
        All deals
      </Link>
      <h1>{deal.name}</h1>
      <p className="mb-10">
        {waiting
          ? `We're waiting on ${numberWord(waiting).toLowerCase()} ${waiting === 1 ? "person" : "people"}.`
          : "The documents are with us."}{" "}
        {questions.length
          ? `We have ${numberWord(questions.length).toLowerCase()} ${questions.length === 1 ? "question" : "questions"} for you.`
          : "Nothing else is needed from you today."}
      </p>
      <section>
        <h2>Questions for you</h2>
        {questions.length ? (
          questions.map((q) => (
            <div className="row flex items-center justify-between gap-5" key={q.key}>
              <div>
                <h3>{q.title}</h3>
                <p>Please help us clarify the information supplied.</p>
              </div>
              <Link className="button primary" href={`${base}/questions/${q.key}`}>
                Answer
              </Link>
            </div>
          ))
        ) : (
          <p className="row">There are no questions for you right now.</p>
        )}
      </section>
      <section className="mt-9">
        <h2>People</h2>
        {people.map(({ person, home }) => {
          const link = links.find((l) => l.partyId === person.id),
            reminder = latestReminder(p.responses, person.id);
          return (
            <div className="row" key={person.id}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <h3>{person.legalName}</h3>
                  <p>
                    {home.todo.length
                      ? `${numberWord(home.todo.length)} ${home.todo.length === 1 ? "thing" : "things"} to do.`
                      : home.waiting.length
                        ? "With us for review."
                        : "All done."}{" "}
                    {link?.lastSeen
                      ? `Last here ${dateLabel(link.lastSeen)}.`
                      : link
                        ? "Hasn't opened the portal yet."
                        : "A personal link hasn't been created yet."}
                  </p>
                  {reminder && <p className="muted">Last reminder {dateLabel(reminder)}</p>}
                </div>
                <a
                  className="button secondary shrink-0 self-start"
                  href={`mailto:?subject=${encodeURIComponent("Documents for " + deal.name)}&body=${encodeURIComponent(`Hi ${person.legalName.split(" ")[0]},\n\nPlease use your personal document link to see what we still need. Let me know if I can help.\n\n${deal.contactName}`)}`}
                >
                  Send a reminder
                </a>
              </div>
              <details className="mt-3">
                <summary className="text-link cursor-pointer">
                  Manage this person&apos;s link and reminder
                </summary>
                <div className="mt-4 flex flex-wrap gap-3">
                  <AdviserAction
                    action={`${base}/action`}
                    kind="link"
                    party={person.id}
                    label={link ? "Create a new link" : "Create personal link"}
                  />
                  {link && (
                    <AdviserAction
                      action={`${base}/action`}
                      kind="revoke"
                      party={person.id}
                      label="Turn off this link"
                    />
                  )}
                  <AdviserAction
                    action={`${base}/action`}
                    kind="reminder_sent"
                    party={person.id}
                    label="I sent it"
                  />
                </div>
              </details>
              {p.responses
                .filter(
                  (r) =>
                    r.partyId === person.id &&
                    ["upload", "answer"].includes(r.kind) &&
                    r.payload.note,
                )
                .map((r) => (
                  <blockquote
                    data-evidence
                    className="mt-4 border-l-2 border-[var(--line)] pl-4"
                    key={r.id}
                  >
                    {String(r.payload.note)}
                  </blockquote>
                ))}
              {home.tasks
                .filter((t) => t.response?.kind === "cant_send")
                .map((t) => (
                  <div className="notice mt-5" key={t.key}>
                    <h3>{t.title}</h3>
                    <p>{t.sentence}</p>
                    {!!t.response?.payload.note && (
                      <blockquote data-evidence>{String(t.response.payload.note)}</blockquote>
                    )}
                    {t.response?.payload.reason === "later" && (
                      <AdviserAction
                        action={`${base}/action`}
                        kind="accept_later"
                        task={t.key}
                        party={person.id}
                        label="Agree to this date"
                      />
                    )}
                    <form action={`${base}/action`} method="post" className="mt-4">
                      <input type="hidden" name="kind" value="waive" />
                      <input type="hidden" name="task" value={t.key} />
                      <label className="block">
                        Reason this document is not needed
                        <input name="note" required minLength={1} />
                      </label>
                      <button className="secondary mt-2">Mark as not needed</button>
                    </form>
                  </div>
                ))}
            </div>
          );
        })}
      </section>
      <section className="aside-panel mt-9">
        <h2>{p.mapped.ready ? "Prepared for lender review" : "The lender file isn't ready yet"}</h2>
        <p className="mt-2">
          {p.mapped.ready
            ? "Everything needed to prepare this file is complete. The lender's decision comes later."
            : "We're still collecting documents, clarifying answers or checking what was sent."}
        </p>
        <p className="muted mt-2">{p.data.preparation.policy}</p>
        {!p.data.preparation.current && (
          <p>We are checking the latest changes before confirming this file is prepared.</p>
        )}
        <div className="mt-4">
          <h3>Later lender work</h3>
          {p.mapped.lenderOrdered.map((row) => (
            <p key={`${row.item_id}-${row.scope_key}-${row.period}`}>
              {row.item}:{" "}
              {row.status === "satisfied"
                ? "Satisfied"
                : row.status === "waived"
                  ? "Waived"
                  : row.status === "not_applicable"
                    ? "Not applicable"
                    : "Still outstanding"}
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <Link className="text-link" href={`${base}/documents`}>
            See every document
          </Link>
          {p.mapped.ready && (
            <a
              className="button primary"
              href={`${base}/download?${sourceUrl(dealId, dealId).split("?")[1]}`}
            >
              Download the lender file
            </a>
          )}
        </div>
      </section>
      {preparedVersions.length > 0 && (
        <section className="mt-9">
          <h2>Earlier prepared versions</h2>
          <p>
            These files record the documents at the date shown. They do not include later changes.
          </p>
          {preparedVersions.map((version) => (
            <p className="row" key={version.id}>
              <a
                className="text-link"
                href={`${base}/download?${sourceUrl(dealId, dealId).split("?")[1]}&version=${version.number}`}
              >
                Download version {version.number} · {dateLabel(version.createdAt)}
              </a>
            </p>
          ))}
        </section>
      )}
      <details className="mt-9">
        <summary className="text-link cursor-pointer">Contact and dates</summary>
        <form action={`${base}/action`} method="post" className="mt-4 space-y-4">
          <input type="hidden" name="kind" value="settings" />
          {[
            ["firm", "Firm name", p.workspace.firmName],
            ["contact", "Contact name", deal.contactName],
            ["email", "Contact email", deal.contactEmail],
            ["sendBy", "Please send these by", deal.sendBy ?? ""],
          ].map(([name, label, value]) => (
            <label className="block" key={name}>
              {label}
              <input
                name={name}
                defaultValue={value}
                type={name === "email" ? "email" : name === "sendBy" ? "date" : "text"}
                required={name !== "sendBy"}
              />
            </label>
          ))}
          <button className="secondary">Save details</button>
        </form>
      </details>
    </Shell>
  );
}
