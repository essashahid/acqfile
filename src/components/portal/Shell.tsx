import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
export type Stage = { title: string; note: string; done: boolean };
export function Shell({
  firm,
  contact,
  email,
  stages,
  children,
  home = "/deals",
}: {
  firm: string;
  contact: string;
  email: string;
  stages: Stage[];
  children: ReactNode;
  home?: string;
}) {
  const current = Math.min(
    3,
    stages.findIndex((s) => !s.done) < 0 ? 3 : stages.findIndex((s) => !s.done),
  );
  return (
    <div className="portal min-h-screen lg:grid lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr]">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to your documents
      </a>
      <aside className="border-b border-[var(--line)] bg-[var(--surface-sunken)] px-5 py-4 lg:flex lg:min-h-screen lg:flex-col lg:border-r lg:p-8">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link href={home} className="firm text-[23px] font-bold leading-tight">
            {firm || "Your adviser"}
          </Link>
          <p className="muted hidden lg:block">Secure document portal</p>
          <a className="text-link text-sm lg:hidden" href={`mailto:${email}`}>
            Ask {contact.split(" ")[0] || "your adviser"}
          </a>
        </div>
        <ol className="mt-10 hidden space-y-7 lg:block">
          {stages.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border text-sm ${s.done ? "border-transparent bg-[var(--ok-soft)] text-[var(--ok)]" : i === current ? "border-transparent bg-[var(--accent)] text-white" : "border-[#c3c0b8] text-[var(--muted)]"}`}
              >
                {s.done ? <Check size={16} aria-hidden /> : i + 1}
              </span>
              <div>
                <p className="font-semibold text-[var(--fg)]">{s.title}</p>
                <p className="muted leading-snug">{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-auto hidden border-t border-[var(--line)] pt-7 lg:block">
          <p className="muted">Questions? Talk to a person.</p>
          <p className="my-2 text-base">
            <strong>{contact || "Your adviser"}</strong>, who is preparing your loan file
          </p>
          <a className="text-link text-base" href={`mailto:${email}`}>
            Send {contact.split(" ")[0] || "your adviser"} a message
          </a>
          <p className="muted mt-5">
            Only the people preparing your loan file can see what you upload.
          </p>
        </div>
      </aside>
      <main
        id="main-content"
        className="w-full max-w-[1000px] px-5 py-6 md:px-12 lg:px-[72px] lg:py-12"
      >
        <p className="muted lg:hidden">
          Step {current + 1} of 4: {stages[current]?.title.toLowerCase()}
        </p>
        {children}
        <footer className="muted mt-12 border-t border-[var(--line)] pt-5">
          <p className="mb-3 lg:hidden">
            Only the people preparing your loan file can see what you upload.
          </p>
          <p>This is a demonstration with sample data.</p>
        </footer>
      </main>
    </div>
  );
}
export const adviserStages = (ready = false): Stage[] => [
  { title: "Deal set up", note: "Done", done: true },
  {
    title: "Collecting documents",
    note: ready ? "All done" : "People are sending their documents",
    done: ready,
  },
  { title: "Final check", note: "We read everything side by side", done: ready },
  { title: "Ready for the lender", note: "One complete, organised file", done: ready },
];
