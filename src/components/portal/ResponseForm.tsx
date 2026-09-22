"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ResponseForm({
  action,
  task,
  kind,
  choices,
  answerMode = "choice",
  evidenceKey,
  contact = "your adviser",
  back,
}: {
  action: string;
  task: string;
  kind: "cant_send" | "answer" | "keep_document";
  choices?: string[];
  answerMode?: "choice" | "clarification";
  evidenceKey?: string;
  contact?: string;
  back: string;
}) {
  const [choice, setChoice] = useState(""),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const data = new FormData(e.currentTarget);
        data.set("kind", kind);
        data.set("task", task);
        if (kind === "answer") data.set("evidenceKey", evidenceKey ?? "");
        try {
          const res = await fetch(action, { method: "POST", body: data });
          if (res.ok) {
            router.push(back);
            router.refresh();
          } else {
            setMessage((await res.json()).message);
            setPending(false);
          }
        } catch {
          setMessage("Please try again in a moment. You can return to your list at any time.");
          setPending(false);
        }
      }}
    >
      {kind !== "keep_document" && (
        <fieldset className="my-8 space-y-4">
          <legend className="sr-only">
            {kind === "answer" ? "Your answer" : "What's happening?"}
          </legend>
          {(kind === "cant_send"
            ? ["later", "already", "not_applicable"]
            : answerMode === "clarification"
              ? ["clarification", "unsure"]
              : [...(choices ?? []), "neither", "unsure"]
          ).map((c) => (
            <label
              className={`block cursor-pointer rounded-[14px] border bg-white p-5 ${choice === c ? "border-2 border-[var(--accent)]" : "border-[#c3c0b8]"}`}
              key={c}
            >
              <span className="flex items-center gap-4">
                <input
                  required
                  type="radio"
                  name={kind === "cant_send" ? "reason" : "choice"}
                  value={c}
                  checked={choice === c}
                  onChange={() => setChoice(c)}
                />
                <strong>
                  {(
                    {
                      later: "I'll send it later",
                      already: "I've already sent this",
                      not_applicable: "This doesn't apply to me",
                      neither: "Neither. The information has changed.",
                      clarification: "I can explain this below",
                      unsure: "I'm not sure yet",
                    } as Record<string, string>
                  )[c] ?? c}
                </strong>
              </span>
              {c === "later" && choice === c && (
                <span className="ml-10 mt-4 block">
                  <span className="mb-2 block">When do you expect to have it?</span>
                  <input aria-label="Expected date" type="date" name="date" required />
                </span>
              )}
            </label>
          ))}
        </fieldset>
      )}
      {kind !== "keep_document" && (
        <>
          <label htmlFor="response-note" className="mb-2 block font-semibold">
            {kind === "answer" && answerMode === "clarification" && choice !== "unsure"
              ? "Please explain what these details mean or what supporting material you can send"
              : "Add a few words (optional)"}
          </label>
          <textarea
            id="response-note"
            name="note"
            rows={3}
            maxLength={2000}
            required={
              kind === "answer" && answerMode === "clarification" && choice === "clarification"
            }
          />
        </>
      )}
      <p role="status" className="my-3">
        {message}
      </p>
      <button className={kind === "keep_document" ? "secondary" : "primary"} disabled={pending}>
        {pending
          ? "Saving…"
          : kind === "answer"
            ? "Send my answer"
            : kind === "keep_document"
              ? "This is the right document"
              : `Tell ${contact.split(" ")[0]}`}
      </button>
      {kind === "cant_send" && (
        <p className="muted mt-4">
          This stays on your list until your adviser confirms what happens next.
        </p>
      )}
    </form>
  );
}
