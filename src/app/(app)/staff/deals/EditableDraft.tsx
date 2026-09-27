"use client";

import { useId, useState } from "react";

export function EditableDraft({
  initialBody,
  findingCount,
  action,
}: {
  initialBody: string;
  findingCount: number;
  action: (data: FormData) => Promise<void>;
}) {
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const draftId = useId();

  return (
    <form action={action} className="space-y-3">
      <label htmlFor={draftId} className="meta block">
        Draft message
      </label>
      <textarea
        id={draftId}
        name="body"
        value={body}
        rows={14}
        className="w-full resize-y rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 font-sans text-[13.5px] leading-6"
        onChange={(event) => {
          setBody(event.target.value);
          setCopied(false);
          setCopyMessage("");
        }}
      />
      <p className="meta">Edits stay on this page until you record the message.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(body);
              setCopied(true);
              setCopyMessage("");
            } catch {
              setCopyMessage("Select and copy the message above.");
            }
          }}
        >
          {copied ? "Copied" : "Copy draft"}
        </button>
        {!confirming ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setConfirming(true)}
          >
            Record as sent
          </button>
        ) : null}
        <span role="status" className="meta">
          {copyMessage}
        </span>
      </div>
      {confirming ? (
        <div className="rounded-[10px] border border-[var(--line)] p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm_findings" required className="mt-1" />
            <span>
              I checked that this edited message still asks for all {findingCount} linked item
              {findingCount === 1 ? "" : "s"}. Recording it will move{" "}
              {findingCount === 1 ? "this finding" : "these findings"} to awaiting a reply.
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              Yes, record this exact message
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
