"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewFactAction, resolveGapAction, reclassifyAction } from "./actions";
import { PdfPage } from "./PdfPage";
import { formatValue } from "@/components/staff";
export type ReviewFact = {
  id: string;
  attribute: string;
  value: unknown;
  method: string;
  confidence: number;
  components: Record<string, number>;
  routing: string;
  verifierReason: string | null;
  correctedValue: unknown;
  validation: string[];
  page: number;
  quote: string;
  verbatim: boolean;
  recordVersion: number;
  reviewNote: string | null;
};
export type ReviewGap = { id: string; type: string; attribute: string | null; reason: string };
const PENDING = ["review", "blocked", "needs_source"];
/** The editable field keeps the raw JSON; everything read-only shows the display form. */
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const TONE: Record<string, string> = {
  review: "pill-warn",
  blocked: "pill-bad",
  needs_source: "pill-bad",
  accepted: "pill-ok",
  auto_accepted: "pill-ok",
  rejected: "pill-quiet",
};

/** One bar per confidence component, so an operator sees which part is weak. */
function Components({ components }: { components: Record<string, number> }) {
  const entries = Object.entries(components);
  if (!entries.length) return null;
  return (
    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--muted)]">
            {k.replaceAll("_", " ")}
          </span>
          <span
            aria-hidden
            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`,
                background: v >= 0.75 ? "var(--ok)" : v > 0 ? "var(--warn)" : "var(--line-strong)",
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-[12.5px] tabular-nums">{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function FactReview({
  dealId,
  segmentId,
  versionId,
  pageStart,
  pageEnd,
  pdf,
  url,
  blocks,
  facts,
  gaps,
  editable,
}: {
  dealId: string;
  segmentId: string;
  versionId: string;
  pageStart: number;
  pageEnd: number;
  pdf: boolean;
  url: string | null;
  blocks: { locator: string; page: number; text: string }[];
  facts: ReviewFact[];
  gaps: ReviewGap[];
  editable: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(pageStart);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reclassifyNote, setReclassifyNote] = useState("");
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(label);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const decide = (f: ReviewFact, action: "accept" | "edit_accept" | "reject" | "needs_source") =>
    run("Decision saved", () =>
      reviewFactAction(dealId, {
        fact_id: f.id,
        expected_record_version: f.recordVersion,
        action,
        value: action === "edit_accept" ? edits[f.id] : undefined,
        comment: comments[f.id] ?? "",
      }),
    );
  const pending = facts.filter((f) => PENDING.includes(f.routing));
  const decided = facts.filter((f) => !PENDING.includes(f.routing));
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card lg:sticky lg:top-20">
        <div className="card-head">
          <h2 className="text-[17px]">Source</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <span className="eyebrow">Page</span>
              <input
                aria-label="Source page"
                type="number"
                min={pageStart}
                max={pageEnd}
                className="w-20"
                value={page}
                onChange={(e) =>
                  setPage(Math.min(pageEnd, Math.max(pageStart, Number(e.target.value))))
                }
              />
            </label>
            <span className="meta">
              of {pageStart}–{pageEnd}
            </span>
            {url ? (
              <a href={url} className="link">
                Original
              </a>
            ) : null}
          </div>
        </div>
        <div className="card-body">
          <p
            role="note"
            className="mb-3 rounded-[9px] border border-[var(--warn-border)] bg-[var(--warn-soft)] px-3 py-2 text-[13px] text-[var(--warn)]"
          >
            {url
              ? "Original document. Identifiers are not masked here."
              : "Original documents are available to admin and operator roles only. Parsed text below is masked."}
          </p>
          {url && pdf ? (
            <PdfPage url={url} page={page} />
          ) : (
            <div className="max-h-[720px] space-y-2 overflow-auto">
              {blocks
                .filter((b) => b.page === page)
                .map((b) => (
                  <blockquote
                    key={b.locator}
                    className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3"
                  >
                    <p className="eyebrow mb-1">{b.locator}</p>
                    <p className="whitespace-pre-wrap text-[13px]">{b.text}</p>
                  </blockquote>
                ))}
            </div>
          )}
        </div>
      </section>

      <div className="min-w-0 space-y-5">
        <section className="card">
          <div className="card-head">
            <h2 className="text-[17px]">Pending values</h2>
            <span className={pending.length ? "pill pill-warn" : "pill pill-ok"}>
              {pending.length} pending
            </span>
          </div>
          <div className="card-body flush">
            {pending.map((f) => (
              <fieldset
                key={f.id}
                disabled={!editable || busy}
                className="rowline"
                aria-label={`Pending ${f.attribute}`}
              >
                <legend className="sr-only">{f.attribute}</legend>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                  <h3>{f.attribute}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${TONE[f.routing] ?? "pill-quiet"}`}>{f.routing}</span>
                    <span className="pill pill-quiet">{f.method}</span>
                  </div>
                </div>

                <p className="mt-2 break-words text-[14px]" data-testid={`value-${f.attribute}`}>
                  {formatValue(f.value)}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <span className="eyebrow">Confidence</span>
                  <span className="text-[15px] font-semibold tabular-nums">
                    {f.confidence.toFixed(2)}
                  </span>
                </div>
                <Components components={f.components} />

                {f.verifierReason ? (
                  <p className="meta mt-2">
                    <span className="eyebrow">Verifier</span> {f.verifierReason}
                  </p>
                ) : null}
                {f.correctedValue !== null && f.correctedValue !== undefined ? (
                  <p className="mt-1.5 text-[13px]">
                    <span className="eyebrow">Suggested</span>{" "}
                    <span>{formatValue(f.correctedValue)}</span>
                  </p>
                ) : null}
                {f.validation.length ? (
                  <p className="meta mt-1.5">
                    <span className="eyebrow">Checks</span> {f.validation.join(", ")}
                  </p>
                ) : null}

                <blockquote className="mt-3 rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px]">
                  <button type="button" className="link" onClick={() => setPage(f.page)}>
                    Show page {f.page}
                  </button>
                  <p className="mt-1 italic">
                    {f.quote}
                    {f.verbatim ? "" : " (as read, not verbatim)"}
                  </p>
                </blockquote>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow">Edit value</span>
                    <input
                      aria-label={`Edit value ${f.attribute}`}
                      className="font-mono"
                      value={edits[f.id] ?? show(f.value)}
                      onChange={(e) => setEdits({ ...edits, [f.id]: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow">Comment (required)</span>
                    <input
                      aria-label={`Comment ${f.attribute}`}
                      required
                      value={comments[f.id] ?? ""}
                      onChange={(e) => setComments({ ...comments, [f.id]: e.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => decide(f, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => decide(f, "edit_accept")}
                  >
                    Edit and accept
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => decide(f, "reject")}>
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => decide(f, "needs_source")}
                  >
                    Needs a better copy
                  </button>
                </div>
              </fieldset>
            ))}
            {!pending.length ? (
              <p className="meta px-[18px] py-4">No pending values on this document.</p>
            ) : null}
          </div>
        </section>

        {gaps.length ? (
          <section className="card">
            <div className="card-head">
              <h2 className="text-[17px]">Open items</h2>
              <span className="pill pill-warn">{gaps.length}</span>
            </div>
            <div className="card-body flush">
              {gaps.map((g) => (
                <fieldset
                  key={g.id}
                  disabled={!editable || busy}
                  className="rowline"
                  aria-label={`Gap ${g.attribute ?? g.type}`}
                >
                  <legend className="sr-only">{g.attribute ?? g.type}</legend>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                    <h3>{g.attribute ?? "document"}</h3>
                    <span className="pill pill-quiet">{g.type.replaceAll("_", " ")}</span>
                  </div>
                  <p className="meta mt-1.5">{g.reason}</p>
                  {g.type === "extraction_gap" ? (
                    <>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="eyebrow">Value from the page</span>
                          <input
                            aria-label={`Enter value ${g.attribute}`}
                            className="font-mono"
                            value={edits[g.id] ?? ""}
                            onChange={(e) => setEdits({ ...edits, [g.id]: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="eyebrow">Comment</span>
                          <input
                            aria-label={`Gap comment ${g.attribute}`}
                            value={comments[g.id] ?? ""}
                            onChange={(e) => setComments({ ...comments, [g.id]: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            run("Value entered", () =>
                              resolveGapAction(dealId, {
                                review_id: g.id,
                                action: "enter",
                                value: edits[g.id],
                                page,
                                comment: comments[g.id] ?? "",
                              }),
                            )
                          }
                        >
                          Enter value from page {page}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            run("Item dismissed", () =>
                              resolveGapAction(dealId, {
                                review_id: g.id,
                                action: "dismiss",
                                comment: comments[g.id] ?? "",
                              }),
                            )
                          }
                        >
                          Not in the document
                        </button>
                      </div>
                    </>
                  ) : null}
                </fieldset>
              ))}
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h2 className="text-[17px]">Decided values</h2>
            <span className="pill pill-quiet">{decided.length}</span>
          </div>
          <div className="card-body flush">
            {decided.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Attribute</th>
                    <th>Value</th>
                    <th>Outcome</th>
                    <th>Version</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((f) => (
                    <tr key={f.id}>
                      <td className="font-medium">{f.attribute}</td>
                      <td className="break-words">{formatValue(f.value)}</td>
                      <td>
                        <span className={`pill ${TONE[f.routing] ?? "pill-quiet"}`}>
                          {f.routing}
                        </span>
                        <p className="meta mt-1">{f.method}</p>
                        {f.reviewNote ? <p className="meta">{f.reviewNote}</p> : null}
                      </td>
                      <td className="num">v{f.recordVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="meta px-[18px] py-4">Nothing decided yet.</p>
            )}
          </div>
        </section>

        {editable ? (
          <section className="card">
            <div className="card-head">
              <h2 className="text-[17px]">Reclassify</h2>
            </div>
            <div className="card-body">
              <p className="meta mb-3">
                Send this document back to filing. Its facts stop counting until it is filed again.
              </p>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("Sent back to filing", async () => {
                    const version = await reclassifyAction(dealId, segmentId, reclassifyNote);
                    router.push(`/staff/deals/${dealId}/files/${version}`);
                  });
                }}
              >
                <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
                  <span className="eyebrow">Reason (required)</span>
                  <input
                    aria-label="Reclassify reason"
                    required
                    value={reclassifyNote}
                    onChange={(e) => setReclassifyNote(e.target.value)}
                  />
                </label>
                <button disabled={busy} className="btn">
                  Reclassify this document
                </button>
              </form>
            </div>
          </section>
        ) : null}

        <p role="status" className="meta min-h-[1.2em]" aria-live="polite">
          {message}
        </p>
        <p className="sr-only">Version {versionId}</p>
      </div>
    </div>
  );
}
