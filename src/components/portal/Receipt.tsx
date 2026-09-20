"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ResponseForm } from "./ResponseForm";
type Result = {
  receipt: string;
  taskKey: string;
  title: string;
  filename: string;
  pages: number;
  notice: string;
  certain: boolean;
  state: string;
};
export function Receipt({
  initial,
  base,
  first,
}: {
  initial: Result;
  base: string;
  first: string;
}) {
  const [result, setResult] = useState(initial);
  useEffect(() => {
    if (result.state !== "checking") return;
    const controller = new AbortController();
    let poll: ReturnType<typeof setTimeout>;
    const deadline = setTimeout(() => {
      controller.abort();
      setResult((r) => ({ ...r, state: "review" }));
    }, 20000);
    async function read() {
      try {
        const res = await fetch(`${base}/uploads/${initial.receipt}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setResult((r) => ({ ...r, state: "review" }));
          return;
        }
        const next: Result = await res.json();
        setResult(next);
        if (next.state === "checking") poll = setTimeout(read, 1000);
      } catch {
        if (!controller.signal.aborted) setResult((r) => ({ ...r, state: "review" }));
      }
    }
    poll = setTimeout(read, 1000);
    return () => {
      controller.abort();
      clearTimeout(poll);
      clearTimeout(deadline);
    };
  }, [base, initial.receipt, result.state]);
  return (
    <>
      <p className="muted">Your {result.title.toLowerCase()}</p>
      <h1>
        {result.state === "noticed"
          ? `Thanks, ${first}. One small thing.`
          : result.state === "checking"
            ? "We're reading your document"
            : "Your document is with us for review"}
      </h1>
      {result.state === "checking" ? (
        <>
          <p>We&apos;ll check for up to 20 seconds here. You don&apos;t need to wait.</p>
          <div className="aside-panel my-8">
            <p>
              Received “{result.filename}”
              {result.pages ? `, ${result.pages} ${result.pages === 1 ? "page" : "pages"}` : ""}
            </p>
            <p className="mt-4">Working out which document it is</p>
            <p className="muted mt-4">Checking the year, the name and the signature</p>
          </div>
          <p className="muted">
            If it takes longer, we carry on in the background and the result shows up on your list.
          </p>
        </>
      ) : result.notice ? (
        <>
          <div className="notice my-8">
            <h3>{result.notice}</h3>
            <p className="muted mt-3">
              You uploaded “{result.filename}”
              {result.pages ? `, ${result.pages} ${result.pages === 1 ? "page" : "pages"}` : ""}.
            </p>
          </div>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <Link className="button primary" href={`${base}/tasks/${result.taskKey}`}>
              Upload another copy
            </Link>
            <ResponseForm
              action={`${base}/action`}
              task={result.taskKey}
              kind="keep_document"
              back={base}
            />
          </div>
          <p className="muted mt-7">
            If you tell us it&apos;s right, a person on our team will take a look and get back to
            you.
          </p>
        </>
      ) : (
        <div className="aside-panel my-8">
          <p>
            We&apos;ve saved your document. A person on our team will take a look. You can carry on
            with your day.
          </p>
        </div>
      )}
      <Link className="button secondary mt-8" href={base}>
        Back to your list
      </Link>
    </>
  );
}
