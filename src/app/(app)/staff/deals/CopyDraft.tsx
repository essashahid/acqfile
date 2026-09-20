"use client";
import { useState } from "react";
export function CopyDraft({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy draft"}
    </button>
  );
}
