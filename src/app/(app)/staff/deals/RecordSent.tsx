"use client";
import { useState } from "react";

/**
 * Recording that a person sent the message. AcqFile sends nothing, so the wording and the
 * confirmation both say what is actually being recorded.
 */
export function RecordSent({ action }: { action: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}>
        Record as sent
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <span className="meta">
        Record that you sent this? The findings move to awaiting a reply.
      </span>
      <button className="btn btn-primary btn-sm">Yes, record it</button>
      <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </form>
  );
}
