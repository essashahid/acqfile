"use client";
import type { ReactNode } from "react";

/** A GET filter form that applies as soon as a select changes; the button stays for no-JS use. */
export function AutoFilter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      className={className}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
      <noscript>
        <button className="btn btn-sm">Apply</button>
      </noscript>
    </form>
  );
}
