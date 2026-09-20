import Link from "next/link";
export function DeliverableNav({ dealId }: { dealId: string }) {
  return (
    <nav className="flex gap-4">
      {["overview", "checklist", "findings", "requests", "package"].map((p) => (
        <Link
          className="underline"
          key={p}
          href={`/deals/${dealId}${p === "overview" ? "" : "/" + p}`}
        >
          {p[0]!.toUpperCase() + p.slice(1)}
        </Link>
      ))}
    </nav>
  );
}
