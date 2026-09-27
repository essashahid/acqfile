import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { requireStaff } from "@/lib/workspace";
import { readDeal } from "@/lib/deals/service";
import { dealView, type Stage, type WorkItem } from "@/lib/staff/deal-view";
import { mutationAllowed } from "@/lib/access";
import { Card, Empty, PageHead } from "@/components/staff";

const GROUP: Record<Stage, { name: string; note?: string }> = {
  blocks: { name: "Blocks the file" },
  yours: { name: "Your review" },
  waiting: { name: "Waiting on others" },
  lender: { name: "Later lender work", note: "doesn’t hold up a version" },
  info: { name: "For information", note: "nothing is requested" },
};
const SHOW: Record<string, Stage[]> = {
  preparation: ["blocks", "yours", "waiting"],
  lender: ["lender"],
  all: ["blocks", "yours", "waiting", "lender"],
};
const STRIP: Record<string, string> = {
  satisfied: "done",
  waived: "done",
  missing: "missing",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (d: Date) =>
  `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${d.toISOString().slice(11, 16)}`;

export default async function DealOverview({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { dealId } = await params;
  const q = await searchParams;
  const ctx = await requireStaff();
  const { deal } = await readDeal(ctx, dealId);
  if (deal.rulePackVersion === "unknown")
    return (
      <>
        <PageHead title="Overview" subtitle="No rule pack is selected for this deal." />
        <Card>
          <Empty>
            Set the expected loan-number date on the deal profile so a rule pack can be resolved.
          </Empty>
        </Card>
      </>
    );
  const v = await dealView(dealId);
  const c = v.counts;
  const base = `/staff/deals/${dealId}`;
  const editable = mutationAllowed(ctx);
  const show = q.show && SHOW[q.show] ? q.show : "preparation";
  const inStage = (stages: Stage[]) => v.work.filter((w) => stages.includes(w.stage));
  const queue = inStage(SHOW[show]!);
  const preparation = inStage(SHOW.preparation!);
  const blocking = inStage(["blocks"]);
  const informational = inStage(["info"]);
  const tab = (key: string, label: string, count: number) => (
    <Link
      key={key}
      href={key === "preparation" ? base : `${base}?show=${key}`}
      aria-current={show === key ? "page" : undefined}
      scroll={false}
    >
      {label} <span className="num">{count}</span>
    </Link>
  );
  const row = (w: WorkItem, first: boolean) => (
    <li key={w.key} className="q-row">
      <span className={`mk mk-${w.stage}`} aria-hidden />
      <div className="q-item">
        <p className="q-title">{w.title}</p>
        <p className="q-sub">{w.subject}</p>
      </div>
      <p className="q-issue">{w.issue}</p>
      <p className={`q-turn ${w.turn === "You" ? "is-you" : ""}`}>
        <span className="sr-only">Whose turn: </span>
        {w.turn}
      </p>
      <div className="q-act">
        <Link
          className={first ? "btn btn-primary btn-sm" : "q-link"}
          href={w.href}
          aria-label={`${editable ? w.action : w.view}: ${w.title}, ${w.subject}`}
        >
          {editable ? w.action : w.view}
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </li>
  );
  const stagesShown = SHOW[show]!;
  return (
    <>
      <PageHead
        title={
          ctx.workspace.role === "admin"
            ? "File oversight"
            : editable
              ? "Prepare the file"
              : "Evidence and decisions"
        }
        actions={
          <>
            {editable ? (
              <Link className="btn" href={`${base}/documents#intake`}>
                <Upload size={15} aria-hidden />
                Upload documents
              </Link>
            ) : null}
            <Link className="btn" href={`${base}/lender-file`}>
              Lender file
            </Link>
          </>
        }
      />
      <div className="space-y-5">
        <section className="card ready" aria-label="Readiness">
          <div className="ready-head">
            <span className={`pill ${v.preparation.ready ? "pill-ok" : "pill-warn"}`}>
              {v.preparation.label}
            </span>
            <p>
              {preparation.length ? (
                <>
                  <b>{preparation.length} open</b>
                  {blocking.length
                    ? ` · ${blocking.length} ${blocking.length === 1 ? "blocks" : "block"} the file`
                    : " · nothing blocks the file"}
                </>
              ) : (
                "Nothing open for preparation"
              )}
            </p>
          </div>
          <div className="ready-grid">
            <Link className="ready-cell" href={`${base}/requirements`}>
              <span className="meta">Preparation</span>
              <span className="big">
                {c.required.done} of {c.required.applicable}
              </span>
              <span
                className="strip"
                role="img"
                aria-label={`${c.required.done} satisfied or waived, ${
                  v.strip.filter((s) => s === "missing").length
                } missing, ${
                  v.strip.filter((s) => !STRIP[s]).length
                } need review, of ${v.strip.length}`}
              >
                {v.strip.map((s, i) => (
                  <i key={i} className={STRIP[s] ?? "review"} />
                ))}
              </span>
            </Link>
            <Link className="ready-cell" href={blocking[0] ? blocking[0].href : `${base}/review`}>
              <span className="meta">Blocks the file</span>
              <span className={`big ${blocking.length ? "is-bad" : ""}`}>{blocking.length}</span>
              <span className="ready-note">{blocking[0]?.title ?? "Nothing blocking"}</span>
            </Link>
            <Link className="ready-cell" href={`${base}/documents`}>
              <span className="meta">Documents</span>
              <span className="big">
                {c.documentsNeedingAttention} <small>need you</small>
              </span>
              <span className="ready-note">{c.filed} filed</span>
            </Link>
            <Link className="ready-cell" href={`${base}/follow-ups`}>
              <span className="meta">Follow-ups</span>
              <span className="big">
                {c.drafts} <small>{c.drafts === 1 ? "draft" : "drafts"}</small>
              </span>
              <span className="ready-note">
                {c.requestsRecorded ? `${c.requestsRecorded} recorded as sent` : "none sent"}
              </span>
            </Link>
          </div>
          <p className="ready-foot">
            {v.evaluation ? `Checked ${when(v.evaluation.createdAt)} · ` : "Not checked yet · "}
            {v.pack.version}
            {v.pack.overlay ? ` · ${v.pack.overlay}` : ""} ·{" "}
            <Link className="link" href={`${base}/profile`}>
              rules unverified
            </Link>{" "}
            · {v.preparation.policy}
          </p>
        </section>

        <section className="card queue" aria-labelledby="next-up">
          <div className="queue-head">
            <h2 id="next-up">Next up</h2>
            <nav className="seg" aria-label="Show">
              {tab("preparation", "Preparation", preparation.length)}
              {tab("lender", "Lender tracking", inStage(["lender"]).length)}
              {tab("all", "All", inStage(SHOW.all!).length)}
            </nav>
          </div>
          {queue.length ? (
            <>
              <div className="q-cols" aria-hidden>
                <span />
                <span>Item</span>
                <span>What is wrong</span>
                <span>Whose turn</span>
                <span>Next step</span>
              </div>
              {stagesShown.map((stage) => {
                const items = queue.filter((w) => w.stage === stage);
                if (!items.length) return null;
                return (
                  <div key={stage} role="group" aria-label={GROUP[stage].name}>
                    <p className="q-group">
                      <span className={`mk mk-${stage}`} aria-hidden />
                      <b>{GROUP[stage].name}</b>
                      <span className="num">{items.length}</span>
                      {GROUP[stage].note ? <span className="meta">{GROUP[stage].note}</span> : null}
                    </p>
                    <ul>{items.map((w) => row(w, editable && w === queue[0]))}</ul>
                  </div>
                );
              })}
            </>
          ) : (
            <p className="q-empty">
              {show === "lender"
                ? "No later lender work is open."
                : "Nothing open. Every preparation item is resolved, waived or not applicable."}
            </p>
          )}
        </section>

        {informational.length ? (
          <details className="card info-group">
            <summary>
              For information <span className="num">{informational.length}</span>
              <span className="meta">nothing is requested</span>
            </summary>
            <ul>{informational.map((w) => row(w, false))}</ul>
          </details>
        ) : null}

        {!editable ? (
          <p className="meta">
            View only.{" "}
            <Link className="link" href={`${base}/requirements?show=all`}>
              Evidence coverage
            </Link>{" "}
            ·{" "}
            <Link className="link" href={`${base}/review?show=history`}>
              Decision history
            </Link>{" "}
            ·{" "}
            <Link className="link" href={`${base}/lender-file`}>
              Version contents
            </Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
