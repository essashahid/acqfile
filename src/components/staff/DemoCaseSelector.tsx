"use client";
import { useState, useTransition } from "react";
import { openDemoCase } from "@/app/(app)/staff/deals/demo-action";
export function DemoCaseSelector({ cases }: { cases: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="mb-5">
      <label className="flex flex-col gap-1 max-w-xl">
        <span className="eyebrow">Demo case</span>
        <select
          defaultValue=""
          disabled={pending}
          onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            setError("");
            start(async () => {
              try {
                await openDemoCase(id);
              } catch (e) {
                if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
                setError("This case could not be opened. Reload and try again.");
              }
            });
          }}
        >
          <option value="">Choose a synthetic case</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} — {c.label}
            </option>
          ))}
        </select>
      </label>
      {pending ? <p role="status">Opening case…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
