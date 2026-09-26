"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
/** Keep the selected record and show a recoverable message when a decision cannot be saved. */
export function DecisionForm({
  action,
  children,
  className,
  id,
}: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      id={id}
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        setBusy(true);
        setMessage("");
        try {
          await action(data);
          setMessage("Saved. The file has been checked again.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not save. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="contents">
        {children}
      </fieldset>
      <p className="meta w-full" role="status">
        {busy ? "Saving…" : message}
      </p>
    </form>
  );
}
