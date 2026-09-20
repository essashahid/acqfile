import type { LucideIcon } from "lucide-react";
import { BookOpenCheck, CircleHelp, FileText } from "lucide-react";

/**
 * One hue per area of the product. Actions keep the single teal accent; these
 * only identify *where* you are, so a page is recognisable before you read it.
 */
export type Hue = "accent" | "docs" | "review" | "evals" | "runs";

/** Complete class strings, so Tailwind sees them at build time. */
export const HUE: Record<Hue, { fg: string; soft: string; border: string; solid: string }> = {
  accent: {
    fg: "text-[var(--accent)]",
    soft: "bg-[var(--accent-soft)]",
    border: "border-[var(--accent-border)]",
    solid: "bg-[var(--accent)]",
  },
  docs: {
    fg: "text-[var(--sec-docs)]",
    soft: "bg-[var(--sec-docs-soft)]",
    border: "border-[var(--sec-docs-border)]",
    solid: "bg-[var(--sec-docs)]",
  },
  review: {
    fg: "text-[var(--sec-review)]",
    soft: "bg-[var(--sec-review-soft)]",
    border: "border-[var(--sec-review-border)]",
    solid: "bg-[var(--sec-review)]",
  },
  evals: {
    fg: "text-[var(--sec-evals)]",
    soft: "bg-[var(--sec-evals-soft)]",
    border: "border-[var(--sec-evals-border)]",
    solid: "bg-[var(--sec-evals)]",
  },
  runs: {
    fg: "text-[var(--sec-runs)]",
    soft: "bg-[var(--sec-runs-soft)]",
    border: "border-[var(--sec-runs-border)]",
    solid: "bg-[var(--sec-runs)]",
  },
};

export type SectionKey = "deals" | "rulepacks" | "help";

export type Section = {
  key: SectionKey;
  label: string;
  href: string;
  icon: LucideIcon;
  hue: Hue;
  /** One sentence a first-time user needs: what this area is for. */
  blurb: string;
};

export const SECTIONS: Record<SectionKey, Section> = {
  deals: {
    key: "deals",
    label: "Deals",
    href: "/staff/deals",
    icon: FileText,
    hue: "accent",
    blurb: "Acquisition profiles, parties, incoming files, filing and fact review.",
  },
  rulepacks: {
    key: "rulepacks",
    label: "Rule packs",
    href: "/staff/rulepacks",
    icon: BookOpenCheck,
    hue: "evals",
    blurb: "Read and compare the evidence requirements and their sources.",
  },
  help: {
    key: "help",
    label: "How it works",
    href: "/staff/how-it-works",
    icon: CircleHelp,
    hue: "accent",
    blurb: "The flow from intake to evaluation, and where each thing lives.",
  },
};

/** Navigation follows the order work actually flows through the product. */
export const NAV_ORDER: SectionKey[] = ["deals", "rulepacks"];

/** Which section a pathname belongs to, for highlighting and page identity. */
export function sectionForPath(pathname: string): SectionKey {
  if (pathname.startsWith("/staff/how-it-works")) return "help";
  for (const key of NAV_ORDER) {
    const href = SECTIONS[key].href;
    if (href !== "/" && (pathname === href || pathname.startsWith(`${href}/`))) return key;
  }
  return "deals";
}
