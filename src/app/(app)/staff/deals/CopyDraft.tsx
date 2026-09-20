"use client";
import { useState } from "react";
export function CopyDraft({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <span>
      <button
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(body);
            setCopied(true);
          } catch {
            setMessage("Select and copy the message below.");
          }
        }}
      >
        {copied ? "Copied" : "Copy draft"}
      </button>
      <span role="status" className="meta">
        {message}
      </span>
    </span>
  );
}
