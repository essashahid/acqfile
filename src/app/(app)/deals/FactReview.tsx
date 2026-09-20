"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewFactAction, resolveGapAction, reclassifyAction } from "./actions";
import { PdfPage } from "./PdfPage";
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
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
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
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-w-0">
        <div className="flex gap-3 mb-3 items-center">
          <h2 className="font-semibold">Source</h2>
          <label>
            Page{" "}
            <input
              aria-label="Source page"
              type="number"
              min={pageStart}
              max={pageEnd}
              className="w-16 border"
              value={page}
              onChange={(e) =>
                setPage(Math.min(pageEnd, Math.max(pageStart, Number(e.target.value))))
              }
            />
          </label>
          {url ? (
            <a href={url} className="underline">
              Original file
            </a>
          ) : null}
        </div>
        {url ? (
          <p role="note" className="text-sm">
            Original document. Identifiers are not masked here.
          </p>
        ) : (
          <p role="note" className="text-sm">
            Original documents are available to admin and operator roles only. Parsed text below is
            masked.
          </p>
        )}
        {url && pdf ? (
          <PdfPage url={url} page={page} />
        ) : (
          <div className="max-h-[750px] overflow-auto space-y-2">
            {blocks
              .filter((b) => b.page === page)
              .map((b) => (
                <blockquote key={b.locator} className="border-l-2 pl-3 whitespace-pre-wrap text-sm">
                  <small>{b.locator}</small>
                  <p>{b.text}</p>
                </blockquote>
              ))}
          </div>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold">Pending values ({pending.length})</h2>
        {pending.map((f) => (
          <fieldset
            key={f.id}
            disabled={!editable || busy}
            className="border rounded p-3 text-sm space-y-2"
            aria-label={`Pending ${f.attribute}`}
          >
            <legend className="font-medium">
              {f.attribute} · {f.routing} · {f.method}
            </legend>
            <p>
              Value:{" "}
              <span className="font-mono" data-testid={`value-${f.attribute}`}>
                {show(f.value)}
              </span>
            </p>
            <p>
              Confidence {f.confidence.toFixed(2)}:{" "}
              {Object.entries(f.components)
                .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
                .join(" · ")}
            </p>
            {f.verifierReason ? <p>Verifier: {f.verifierReason}</p> : null}
            {f.correctedValue !== null && f.correctedValue !== undefined ? (
              <p>
                Suggested correction: <span className="font-mono">{show(f.correctedValue)}</span>
              </p>
            ) : null}
            {f.validation.length ? <p>Checks: {f.validation.join(", ")}</p> : null}
            <p>
              <button type="button" className="underline" onClick={() => setPage(f.page)}>
                Show page {f.page}
              </button>{" "}
              · “{f.quote}”{f.verbatim ? "" : " (as read, not verbatim)"}
            </p>
            <label className="block">
              Edit value{" "}
              <input
                aria-label={`Edit value ${f.attribute}`}
                className="w-full border rounded p-1 font-mono"
                value={edits[f.id] ?? show(f.value)}
                onChange={(e) => setEdits({ ...edits, [f.id]: e.target.value })}
              />
            </label>
            <label className="block">
              Comment{" "}
              <input
                aria-label={`Comment ${f.attribute}`}
                required
                className="w-full border rounded p-1"
                value={comments[f.id] ?? ""}
                onChange={(e) => setComments({ ...comments, [f.id]: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded bg-teal-800 text-white px-3 py-1"
                onClick={() => decide(f, "accept")}
              >
                Accept
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => decide(f, "edit_accept")}
              >
                Edit and accept
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => decide(f, "reject")}
              >
                Reject
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => decide(f, "needs_source")}
              >
                Needs a better copy
              </button>
            </div>
          </fieldset>
        ))}
        {!pending.length && <p>No pending values on this document.</p>}
        {gaps.length > 0 && <h2 className="font-semibold">Open items ({gaps.length})</h2>}
        {gaps.map((g) => (
          <fieldset
            key={g.id}
            disabled={!editable || busy}
            className="border rounded p-3 text-sm space-y-2"
            aria-label={`Gap ${g.attribute ?? g.type}`}
          >
            <legend className="font-medium">
              {g.type} · {g.attribute ?? "document"}
            </legend>
            <p>{g.reason}</p>
            {g.type === "extraction_gap" && (
              <>
                <label className="block">
                  Value from the page{" "}
                  <input
                    aria-label={`Enter value ${g.attribute}`}
                    className="w-full border rounded p-1 font-mono"
                    value={edits[g.id] ?? ""}
                    onChange={(e) => setEdits({ ...edits, [g.id]: e.target.value })}
                  />
                </label>
                <label className="block">
                  Comment{" "}
                  <input
                    aria-label={`Gap comment ${g.attribute}`}
                    className="w-full border rounded p-1"
                    value={comments[g.id] ?? ""}
                    onChange={(e) => setComments({ ...comments, [g.id]: e.target.value })}
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="rounded bg-teal-800 text-white px-3 py-1"
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
                    className="rounded border px-3 py-1"
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
            )}
          </fieldset>
        ))}
        <h2 className="font-semibold">Decided values ({decided.length})</h2>
        <ul className="text-sm divide-y">
          {decided.map((f) => (
            <li key={f.id} className="py-1">
              {f.attribute}: <span className="font-mono">{show(f.value)}</span> · {f.routing} ·{" "}
              {f.method} · v{f.recordVersion}
              {f.reviewNote ? ` · ${f.reviewNote}` : ""}
            </li>
          ))}
        </ul>
        {editable && (
          <form
            className="space-y-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Sent back to filing", async () => {
                const version = await reclassifyAction(dealId, segmentId, reclassifyNote);
                router.push(`/deals/${dealId}/files/${version}`);
              });
            }}
          >
            <label className="block">
              Reclassify: reason{" "}
              <input
                aria-label="Reclassify reason"
                required
                className="w-full border rounded p-1"
                value={reclassifyNote}
                onChange={(e) => setReclassifyNote(e.target.value)}
              />
            </label>
            <button disabled={busy} className="rounded border px-3 py-1">
              Reclassify this document
            </button>
          </form>
        )}
        <p role="status">{message}</p>
        <p className="text-xs">Version {versionId}</p>
      </section>
    </div>
  );
}
