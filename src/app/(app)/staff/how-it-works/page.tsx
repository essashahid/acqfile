import { PRODUCT_NAME } from "@/lib/product";
import Link from "next/link";
import { GitBranch, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { Card, PageHead } from "@/components/staff";

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "No citation, no value",
    body: "Every extracted fact cites a source block or an image region and quotes it. Text quotes are checked verbatim in code; image reads are marked as not verbatim.",
  },
  {
    icon: UserCheck,
    title: "A second model checks the first",
    body: "An independent verifier re-reads the evidence on a different model without seeing the extractor's confidence.",
  },
  {
    icon: GitBranch,
    title: "Code scores, people decide",
    body: "Confidence is a weighted sum of measured components, never a model's opinion. Below the bar, or on any image read, a person decides.",
  },
  {
    icon: Lock,
    title: "Nothing is overwritten",
    body: "Files, filing records, facts and decisions create new versions with an audit event. Stale edits are rejected.",
  },
];

const STEPS = [
  [
    "Deal",
    "Create a deal from its profile: parties, roles, ownership and transaction terms. The rule pack follows the expected loan-number date.",
  ],
  [
    "Intake",
    "Upload a folder or ZIP as a numbered batch. Files are hashed; exact duplicates create no version and no model call.",
  ],
  [
    "Parse and file",
    "Text layers, form fields, paragraphs and cells become source blocks. Documents are classified by signature first, by a model only when cues are inconclusive, and bundles are confirmed by an operator.",
  ],
  [
    "Read",
    "Each confirmed document is read by its method: official form fields directly, text through the extractor and verifier, image-only pages through two independent reads. Facts route to auto-accept, review or blocked.",
  ],
  [
    "Review",
    "One screen per document shows the page beside every pending value with its confidence breakdown and the verifier's reason. Accept, edit, reject, ask for a better copy or reclassify.",
  ],
  [
    "Evaluate",
    "After filing, review or a profile change the rule engine runs on current rows. The deal page shows checklist, finding and review counts.",
  ],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHead
        title="How it works"
        subtitle={`${PRODUCT_NAME} prepares an acquisition loan file from supplied documents. Flags are preparation aids for lender review, not determinations.`}
      />
      <div className="space-y-5">
        <Card title="From intake to evaluation">
          <ol className="space-y-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="font-semibold">
                  {i + 1}. {title}.
                </span>{" "}
                {body}
              </li>
            ))}
          </ol>
        </Card>
        <div className="grid gap-5 md:grid-cols-2">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <div className="flex items-start gap-3">
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <div>
                  <h3>{title}</h3>
                  <p className="meta mt-1">{body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <p>
          <Link href="/staff/deals" className="link">
            Open the deals
          </Link>{" "}
          or{" "}
          <Link href="/staff/rulepacks" className="link">
            read the rule packs
          </Link>
          .
        </p>
      </div>
    </>
  );
}
