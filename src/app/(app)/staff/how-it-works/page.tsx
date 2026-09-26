import { PRODUCT_NAME } from "@/lib/product";
import Link from "next/link";
import { env } from "@/lib/env";
import { Card, PageHead } from "@/components/staff";

const STEPS = [
  ["Set up the deal", "Enter the parties, ownership and transaction terms on the deal profile."],
  ["Upload documents", "Add files or a ZIP. Exact duplicates are recognized and not added twice."],
  [
    "Confirm filing",
    "Check each document's type, person or business, period and signature on Documents.",
  ],
  [
    "Check values",
    "Compare values read from each document with its page. Accept or correct them with a note.",
  ],
  [
    "Work through Requirements and Review",
    "Each open item says what is missing or unconfirmed and links to the screen that resolves it. Record manual checks and lender tracking there.",
  ],
  ["Send follow-ups", "Copy a prepared message and send it yourself. AcqFile does not send email."],
  [
    "Download the lender file",
    "When nothing stops preparation, create a version and download it. Later lender work stays listed.",
  ],
];

export default function HowItWorksPage() {
  const mock = env().LLM_PROVIDER === "mock";
  return (
    <>
      <PageHead
        title="How it works"
        subtitle={`${PRODUCT_NAME} helps you prepare an acquisition loan file. It does not approve loans or decide eligibility; the lender does.`}
      />
      <div className="space-y-5">
        <Card title="The workflow">
          <ol className="space-y-2.5">
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
        <Card title="How values are read">
          <p>
            {mock
              ? "This demo uses prepared sample readings. No AI model reads the documents here; each prepared value still cites its page, and a person confirms it."
              : "Values are read from form fields directly and from text or scans by a model, then checked against the quoted source. Anything uncertain waits for a person."}
          </p>
          <p className="meta mt-2">
            Every value cites its page. Corrections and decisions are saved as new versions with
            your name; nothing is overwritten.
          </p>
        </Card>
        <details className="reveal">
          <summary>Technical detail</summary>
          <Card className="mt-2">
            <ul className="meta list-disc space-y-1.5 pl-5">
              <li>
                Text quotes are checked word for word in code. Values read from scans are marked as
                not verbatim.
              </li>
              <li>
                With a live model, a second model re-reads each value without seeing the first
                model&apos;s score. Scores are computed in code, not taken from a model.
              </li>
              <li>
                The rules run again after any filing, value decision or profile change. Rule packs
                are illustrative and have not been verified by a lender.
              </li>
            </ul>
          </Card>
        </details>
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
