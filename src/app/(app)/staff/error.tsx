"use client";
import Link from "next/link";
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card">
      <div className="card-body space-y-4">
        <h1>This view could not be opened</h1>
        <p>Your saved work is still available. Try again or return to the deal list.</p>
        <div className="flex gap-3">
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn" href="/staff/deals">
            All deals
          </Link>
        </div>
        <details className="reveal">
          <summary>Technical detail</summary>
          <p className="meta mt-2 break-words">{error.message}</p>
        </details>
      </div>
    </section>
  );
}
