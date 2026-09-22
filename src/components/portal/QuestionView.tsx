import type { Question } from "@/lib/portal/map";
import { ResponseForm } from "./ResponseForm";
export function QuestionView({
  question,
  action,
  back,
  sourceLink,
}: {
  question: Question;
  action: string;
  back: string;
  sourceLink: (version: string, page: number | null) => string;
}) {
  return (
    <>
      <h1>{question.title}</h1>
      <p>
        {question.kind === "choice"
          ? "We don't want to guess. Which of these values should we use?"
          : question.kind === "clarification"
            ? "These details need an explanation. Please tell us how they fit together or what supporting material you can send."
            : "Your adviser needs to review these details before asking you for anything else."}
      </p>
      <div className="my-9">
        {question.sources.map((s, i) => (
          <div className="row flex items-center justify-between gap-4" key={i}>
            <div>
              <h3>{s.label}</h3>
              {s.quote ? (
                <blockquote data-evidence className="muted">
                  {s.page ? `Page ${s.page}: ` : ""}“{s.quote}”
                </blockquote>
              ) : null}
              <p data-evidence>{s.value}</p>
            </div>
            {s.versionId && (
              <a className="text-link shrink-0" href={sourceLink(s.versionId, s.page)}>
                See the page
              </a>
            )}
          </div>
        ))}
      </div>
      {question.kind !== "staff_review" ? (
        <ResponseForm
          action={action}
          task={question.key}
          kind="answer"
          answerMode={question.kind}
          evidenceKey={question.evidenceKey}
          choices={question.values}
          back={back}
        />
      ) : null}
      <p className="muted mt-5">
        Your answer goes to the team for review. We&apos;ll let you know if a document needs
        updating.
      </p>
      {question.history.length > 0 ? (
        <section className="mt-9">
          <h2>Earlier answers</h2>
          {question.history.map((answer) => (
            <div className="row" key={answer.id}>
              <p>{String(answer.payload.choice ?? "Not stated")}</p>
              {answer.payload.note ? <p>{String(answer.payload.note)}</p> : null}
              <p className="muted">
                {answer.payload.evidenceKey === question.evidenceKey
                  ? "This answer refers to the details shown here."
                  : "The documents or values have changed since this answer."}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
