"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AdviserAction({
  action,
  kind,
  party,
  task,
  label,
}: {
  action: string;
  kind: string;
  party?: string;
  task?: string;
  label: string;
}) {
  const [message, setMessage] = useState(""),
    [link, setLink] = useState(""),
    [pending, setPending] = useState(false),
    router = useRouter();
  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const data = new FormData();
          data.set("kind", kind);
          if (party) data.set("party", party);
          if (task) data.set("task", task);
          try {
            const r = await fetch(action, { method: "POST", body: data }),
              body = await r.json();
            if (r.ok) {
              if (body.token) setLink(`${location.origin}/p/${body.token}`);
              else {
                setMessage("Saved.");
                router.refresh();
              }
            } else setMessage(body.message);
          } catch {
            setMessage("Please try again in a moment.");
          }
          setPending(false);
        }}
      >
        <button className="secondary" disabled={pending}>
          {label}
        </button>
      </form>
      {link && (
        <label className="mt-3 block">
          Copy this link now. It is only shown here once.
          <input
            aria-label="New personal link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      <p role="status" className="muted">
        {message}
      </p>
    </div>
  );
}
