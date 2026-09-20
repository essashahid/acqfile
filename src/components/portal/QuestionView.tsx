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
      <p>We don&apos;t want to guess, so could you tell us which information to use?</p>
      <div className="my-9">
        {question.sources.map((s, i) => (
          <div className="row flex items-center justify-between gap-4" key={i}>
            <div>
              <h3>{s.label}</h3>
              {s.quote ? (
                <blockquote data-evidence className="muted">
                  {s.page ? `Page ${s.page}: ` : ""}“{s.quote}”
                </blockquote>
              ) : (
                <p data-evidence>{s.value}</p>
              )}
            </div>
            {s.versionId && (
              <a className="text-link shrink-0" href={sourceLink(s.versionId, s.page)}>
                See the page
              </a>
            )}
          </div>
        ))}
      </div>
      <ResponseForm
        action={action}
        task={question.key}
        kind="answer"
        choices={question.values}
        back={back}
      />
      <p className="muted mt-5">
        We&apos;ll ask for the other document to be corrected. Your answer stays separate from the
        documents until that happens.
      </p>
    </>
  );
}
