"use client";
import { SourceEditor, ValueEditor, type SourceDraft } from "./ValueEditor";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { reviewFactAction, resolveGapAction, reclassifyAction } from "./actions";
import { PdfPage } from "./PdfPage";
import { Pill } from "@/components/staff";
import { attributeName, factValue } from "@/lib/staff/labels";
import { FACTS } from "@/lib/domain/registry";
const display = (f: ReviewFact, value: unknown = f.value) =>
  factValue(f.attribute, FACTS[f.attribute]?.unit ?? "text", value);
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
  history = [],
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
  history?: ReviewFact[];
  gaps: ReviewGap[];
  editable: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(pageStart);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, SourceDraft>>({});
  const [correcting, setCorrecting] = useState<string | null>(null);
  const sourceFor = (id: string): SourceDraft =>
    sources[id] ?? { page, quote: "", kind: "quote", region: "" };
  const sourceInput = (id: string) => ({
    ...sourceFor(id),
    region: sourceFor(id).region || undefined,
  });
  const sourceEditor = (id: string, label: string) => (
    <SourceEditor
      label={label}
      value={sourceFor(id)}
      min={pageStart}
      max={pageEnd}
      onChange={(v) => setSources({ ...sources, [id]: v })}
    />
  );
  const [reclassifyNote, setReclassifyNote] = useState("");
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await fn();
      if (result && typeof result === "object" && "error" in result)
        throw Error(String(result.error));
      setMessage(label);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const decide = (
    f: ReviewFact,
    action: "accept" | "edit_accept" | "reject" | "needs_source" | "reopen",
  ) =>
    run("Decision saved", () =>
      reviewFactAction(dealId, {
        fact_id: f.id,
        expected_record_version: f.recordVersion,
        action,
        value: action === "edit_accept" ? (edits[f.id] ?? show(f.value)) : undefined,
        source: action === "edit_accept" ? sourceInput(f.id) : undefined,
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
            <div className="max-h-[65vh] space-y-2 overflow-auto">
              {!blocks.some((b) => b.page === page) ? (
                <p className="meta">
                  No text layer is available on this page. Recorded image reads appear beside it;
                  originals require an Operator or Admin account.
                </p>
              ) : null}
              {blocks
                .filter((b) => b.page === page)
                .map((b) => (
                  <blockquote
                    key={b.locator}
                    className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3"
                  >
                    <p className="eyebrow mb-1">Page {b.page}</p>
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
                disabled={busy}
                className="rowline"
                aria-label={`Pending ${f.attribute}`}
              >
                <legend className="sr-only">{f.attribute}</legend>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                  <h3>{attributeName(f.attribute)}</h3>
                  <div className="flex items-center gap-2">
                    <Pill value={f.routing} />
                    <span className="meta">
                      {f.method === "manual" ? "Operator confirmed" : "Extracted"}
                    </span>
                  </div>
                </div>

                <p className="mt-2 break-words text-[14px]" data-testid={`value-${f.attribute}`}>
                  {display(f)}
                </p>

                <details className="reveal mt-3">
                  <summary>How this value was checked</summary>{" "}
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
                      <span>{display(f, f.correctedValue)}</span>
                    </p>
                  ) : null}
                  {f.validation.length ? (
                    <p className="meta mt-1.5">
                      <span className="eyebrow">Checks</span> {f.validation.join(", ")}
                    </p>
                  ) : null}
                </details>
                <blockquote className="mt-3 rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px]">
                  <button type="button" className="link" onClick={() => setPage(f.page)}>
                    Show page {f.page}
                  </button>
                  <p className="mt-1 italic">
                    {f.quote}
                    {f.verbatim ? "" : " (as read, not verbatim)"}
                  </p>
                </blockquote>

                {editable ? (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ValueEditor
                        attribute={f.attribute}
                        value={edits[f.id] ?? show(f.value)}
                        onChange={(v) => setEdits({ ...edits, [f.id]: v })}
                      />
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

                    {sourceEditor(f.id, f.attribute)}
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
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => decide(f, "reject")}
                      >
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
                  </>
                ) : (
                  <p className="meta mt-3">
                    Awaiting an operator decision. You can inspect the source and recorded checks.
                  </p>
                )}
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
                  disabled={busy}
                  className="rowline"
                  aria-label={`Gap ${g.attribute ?? g.type}`}
                >
                  <legend className="sr-only">{g.attribute ?? g.type}</legend>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                    <h3>{g.attribute ?? "document"}</h3>
                    <span className="pill pill-quiet">{g.type.replaceAll("_", " ")}</span>
                  </div>
                  <p className="meta mt-1.5">{g.reason}</p>
                  {g.type === "extraction_gap" && editable ? (
                    <>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ValueEditor
                          attribute={g.attribute!}
                          label="Enter value"
                          value={edits[g.id] ?? ""}
                          onChange={(v) => setEdits({ ...edits, [g.id]: v })}
                        />
                        <label className="flex flex-col gap-1">
                          <span className="eyebrow">Comment</span>
                          <input
                            aria-label={`Gap comment ${g.attribute}`}
                            value={comments[g.id] ?? ""}
                            onChange={(e) => setComments({ ...comments, [g.id]: e.target.value })}
                          />
                        </label>
                      </div>
                      {sourceEditor(g.id, g.attribute!)}
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
                                source: sourceInput(g.id),
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
                    <Fragment key={f.id}>
                      <tr>
                        <td className="font-medium">
                          {attributeName(f.attribute)}
                          <button
                            type="button"
                            className="link block mt-1"
                            onClick={() => setPage(f.page)}
                          >
                            Show page {f.page}
                          </button>
                          <blockquote className="meta mt-2 italic">
                            {f.quote}
                            {f.verbatim ? "" : " (as read, not verbatim)"}
                          </blockquote>
                        </td>
                        <td className="min-w-28">{display(f)}</td>
                        <td>
                          <span className={`pill ${TONE[f.routing] ?? "pill-quiet"}`}>
                            {f.routing.replaceAll("_", " ")}
                          </span>
                          <p className="meta mt-1">{f.method}</p>
                          {f.reviewNote ? <p className="meta">{f.reviewNote}</p> : null}
                        </td>
                        <td className="num">v{f.recordVersion}</td>
                      </tr>
                      {editable ? (
                        <tr>
                          <td colSpan={4}>
                            <fieldset
                              disabled={busy}
                              aria-label={`Decision ${f.attribute}`}
                              className="mt-2 space-y-2"
                            >
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => setCorrecting(correcting === f.id ? null : f.id)}
                              >
                                Correct value
                              </button>
                              {correcting === f.id ? (
                                <>
                                  <ValueEditor
                                    attribute={f.attribute}
                                    value={edits[f.id] ?? show(f.value)}
                                    onChange={(v) => setEdits({ ...edits, [f.id]: v })}
                                  />
                                  {sourceEditor(f.id, f.attribute)}
                                </>
                              ) : null}
                              <label className="block">
                                Reason (required)
                                <input
                                  aria-label={`Decision reason ${f.attribute}`}
                                  value={comments[f.id] ?? ""}
                                  onChange={(e) =>
                                    setComments({ ...comments, [f.id]: e.target.value })
                                  }
                                />
                              </label>
                              {correcting === f.id ? (
                                <button
                                  className="btn btn-primary btn-sm"
                                  type="button"
                                  onClick={() => decide(f, "edit_accept")}
                                >
                                  Save correction
                                </button>
                              ) : null}
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => decide(f, "reopen")}
                              >
                                Reopen review
                              </button>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => decide(f, "reject")}
                              >
                                Reject
                              </button>
                            </fieldset>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="meta px-[18px] py-4">Nothing decided yet.</p>
            )}
          </div>
        </section>

        {history.length ? (
          <details className="reveal">
            <summary>Earlier value records ({history.length})</summary>
            <section className="card mt-3">
              <div className="card-head">
                <h2>Value history</h2>
                <p className="meta">
                  Earlier records are preserved; only current accepted values feed the file checks.
                </p>
              </div>
              <ul>
                {history.map((f) => (
                  <li key={f.id} className="rowline">
                    <h3>{attributeName(f.attribute)}</h3>
                    <p>
                      {display(f)}{" "}
                      <span className="meta">
                        · Version {f.recordVersion} · {f.routing.replaceAll("_", " ")}
                      </span>
                    </p>
                    {f.reviewNote ? <p className="meta">{f.reviewNote}</p> : null}
                    <blockquote className="meta italic mt-2">{f.quote}</blockquote>
                    <button type="button" className="link mt-2" onClick={() => setPage(f.page)}>
                      Show page {f.page}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </details>
        ) : null}

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
                    router.push(`/staff/deals/${dealId}/documents/${version}`);
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
