import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Page title, one line of context, and the actions that belong to the page. */
export function PageHead({
  title,
  eyebrow,
  subtitle,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="meta mt-1.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** The one container. Everything on a staff page sits in one of these. */
export function Card({
  title,
  description,
  actions,
  children,
  flush = false,
  className = "",
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("card", className)} {...rest}>
      {title ? (
        <div className="card-head">
          <div className="min-w-0">
            <h2 className="text-[17px]">{title}</h2>
            {description ? <p className="meta mt-1">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("card-body", flush && "flush")}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  // checklist statuses
  satisfied: "pill-ok",
  waived: "pill-quiet",
  not_applicable: "pill-quiet",
  tracking: "pill-accent",
  missing: "pill-bad",
  received_with_issues: "pill-warn",
  needs_review: "pill-warn",
  // finding lifecycle
  open: "pill-warn",
  requested: "pill-accent",
  resolved: "pill-ok",
  dismissed: "pill-quiet",
  // finding types
  conflict: "pill-bad",
  stale: "pill-warn",
  incomplete: "pill-warn",
  info: "pill-quiet",
  // severity
  blocker: "pill-bad",
  major: "pill-warn",
  minor: "pill-quiet",
  // fact routing
  auto_accepted: "pill-ok",
  accepted: "pill-ok",
  review: "pill-warn",
  blocked: "pill-bad",
  rejected: "pill-quiet",
  needs_source: "pill-bad",
  // check results
  pass: "pill-ok",
  fail: "pill-bad",
  unknown: "pill-warn",
  // processing
  parsed: "pill-ok",
  completed: "pill-ok",
  completed_with_review: "pill-warn",
  failed: "pill-bad",
  pending: "pill-quiet",
  queued: "pill-quiet",
  confirmed: "pill-ok",
  proposed: "pill-warn",
  superseded: "pill-quiet",
  duplicate: "pill-quiet",
};

/** The one coloured element. Raw database values become sentence case; the value stays in the tooltip. */
export function Pill({ value, title }: { value: string | null | undefined; title?: string }) {
  if (!value) return <span className="meta">—</span>;
  const label = value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <span className={cn("pill", TONES[value] ?? "pill-quiet")} title={title ?? value}>
      {label}
    </span>
  );
}

/**
 * Display form of a stored fact value. Identifiers show their last four (Guardrail 7); tables read
 * as rows rather than JSON. Anything else falls back to JSON so nothing is silently hidden.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "object") return String(value);
  if ("last_four" in (value as object)) return `••••${(value as { last_four: string }).last_four}`;
  if (Array.isArray(value))
    return value
      .map((item) =>
        item && typeof item === "object"
          ? Object.entries(item as Record<string, unknown>)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([, v]) => formatValue(v))
              .join(" / ")
          : formatValue(item),
      )
      .join("; ");
  // A plain object is segment metadata; read it as pairs and drop internal identifiers.
  const pairs = Object.entries(value as Record<string, unknown>)
    .filter(([k, v]) => !k.endsWith("_id") && v !== null && v !== undefined)
    .map(([k, v]) => `${k.replaceAll("_", " ")} ${formatValue(v)}`);
  return pairs.length ? pairs.join(" · ") : JSON.stringify(value);
}

/** A labelled number. Counts only, never a lone percentage. */
export function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--fg)]">
        {testId ? <span data-testid={testId}>{value}</span> : value}
      </p>
      {hint ? <p className="meta mt-0.5">{hint}</p> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="meta py-1">{children}</p>;
}

/** Deal tabs. Rendered server-side; the active tab comes from the caller. */
export function DealTabs({ dealId, current }: { dealId: string; current: string }) {
  const tabs = [
    ["overview", "Overview", ""],
    ["checklist", "Checklist", "/checklist"],
    ["findings", "Findings", "/findings"],
    ["requests", "Requests", "/requests"],
    ["package", "Lender file", "/package"],
  ] as const;
  return (
    <nav className="tabs mb-5" aria-label="Deal sections">
      {tabs.map(([key, label, path]) => (
        <Link
          key={key}
          href={`/staff/deals/${dealId}${path}`}
          className="tab"
          aria-current={key === current ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
