"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  FileStack,
  FolderOpen,
  ListChecks,
  Package,
  Send,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type RailCounts = {
  attention: number;
  requirementsOpen: number;
  findingsOpen: number;
  followUps: number;
  versions: number;
};

/**
 * One persistent rail for the whole deal. The business name leads; the deal code is secondary
 * identification. Section counts are current work only, so a badge always means "look here".
 */
export function DealRail({
  dealId,
  code,
  name,
  counts,
}: {
  dealId: string;
  code: string;
  name: string;
  counts: RailCounts;
}) {
  const pathname = usePathname();
  const base = `/staff/deals/${dealId}`;
  const sections = [
    { href: base, label: "Overview", icon: Gauge, count: 0, exact: true },
    { href: `${base}/documents`, label: "Documents", icon: FolderOpen, count: counts.attention },
    {
      href: `${base}/requirements`,
      label: "Requirements",
      icon: ListChecks,
      count: counts.requirementsOpen,
    },
    { href: `${base}/review`, label: "Review", icon: FileStack, count: counts.findingsOpen },
    { href: `${base}/follow-ups`, label: "Follow-ups", icon: Send, count: counts.followUps },
    { href: `${base}/lender-file`, label: "Lender file", icon: Package, count: 0 },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Deal sections" className="deal-rail">
      <Link href="/staff/deals" className="rail-back">
        <ArrowLeft size={14} aria-hidden />
        All deals
      </Link>
      <div className="rail-deal">
        <p className="rail-name" title={name}>
          {name}
        </p>
        <p className="rail-code">{code}</p>
      </div>
      <ul className="rail-list">
        {sections.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              aria-current={active(s.href, s.exact) ? "page" : undefined}
              className={cn("rail-link", active(s.href, s.exact) && "is-active")}
            >
              <s.icon size={16} aria-hidden strokeWidth={1.9} />
              <span className="flex-1">{s.label}</span>
              {s.count > 0 ? (
                <span className="rail-count" aria-label={`${s.count} needing attention`}>
                  {s.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <div className="rail-foot">
        <Link
          href={`${base}/profile`}
          aria-current={active(`${base}/profile`) ? "page" : undefined}
          className={cn("rail-link", active(`${base}/profile`) && "is-active")}
        >
          <BookOpenCheck size={16} aria-hidden strokeWidth={1.9} />
          <span className="flex-1">Profile and rules</span>
        </Link>
      </div>
    </nav>
  );
}
