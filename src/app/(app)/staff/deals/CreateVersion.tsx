"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ complete }: { complete: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" disabled={pending}>
      {pending
        ? "Creating version…"
        : complete
          ? "Create lender-file version"
          : "Create version anyway"}
    </button>
  );
}

/**
 * Creating a version is allowed while work is outstanding, because an operator may need a
 * point-in-time record. The button says which one it is, and a double click cannot submit twice.
 */
export function CreateVersion({
  action,
  complete,
}: {
  action: () => Promise<void>;
  complete: boolean;
}) {
  const [confirming, setConfirming] = useState(complete);
  if (!complete && !confirming)
    return (
      <button type="button" className="btn" onClick={() => setConfirming(true)}>
        Create a version while work is outstanding
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Submit complete={complete} />
      {!complete ? (
        <span className="meta">
          This version will record that requirements are still outstanding.
        </span>
      ) : null}
    </form>
  );
}
