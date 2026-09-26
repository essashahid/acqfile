"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KNOWN_DOCUMENT_TYPES, documentName } from "@/lib/staff/labels";
import type { Candidate } from "@/lib/deals/classification";
import { reviewFileAction } from "./actions";
import { PdfPage } from "./PdfPage";
type Row = Candidate & { party_id: string | null };
const empty: Row = {
  page_start: 1,
  page_end: 1,
  doc_type: "UNREADABLE",
  alternatives: [],
  party_name: null,
  party_id: null,
  period_raw: null,
  period: null,
  form_revision: null,
  signed: null,
  dated: null,
  signature_date: null,
  document_date: null,
  expected_page_count: null,
  account_last_four: null,
  quote: "Manual filing",
  quote_page: 1,
  evidence: [],
  uncertain: false,
};
export function FileReview({
  dealId,
  versionId,
  recordId,
  initial,
  parties,
  pages,
  unreadable,
  url,
  pdf,
  blocks,
  editable,
  conflict,
  initialPage = 1,
}: {
  dealId: string;
  versionId: string;
  recordId: string | null;
  initial: Row[];
  parties: { id: string; name: string }[];
  pages: number;
  unreadable: boolean;
  url: string | null;
  pdf: boolean;
  blocks: { locator: string; page: number; rawText: string }[];
  editable: boolean;
  conflict: boolean;
  initialPage?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial.length ? initial : [empty]);
  const [page, setPage] = useState(initialPage);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="card lg:sticky lg:top-20">
        <div className="card-head">
          <h2 className="text-[17px]">Source</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <span className="eyebrow">Page</span>
              <input
                aria-label="Source page"
                type="number"
                min={1}
                max={pages || 1}
                className="w-20"
                value={page}
                onChange={(e) => setPage(Math.min(pages || 1, Math.max(1, Number(e.target.value))))}
              />
            </label>
            <span className="meta">of {pages || 1}</span>
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
          {url && pdf && !unreadable ? (
            <PdfPage url={url} page={page} />
          ) : unreadable ? (
            <p className="meta">
              This file could not be opened. Manual filing records its place in the index; it
              supplies no evidence.
            </p>
          ) : (
            <div className="max-h-[720px] space-y-2 overflow-auto">
              {blocks
                .filter((b) => b.page === page)
                .map((b, i) => (
                  <blockquote
                    key={i}
                    className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3"
                  >
                    <p className="eyebrow mb-1">{b.locator}</p>
                    <p className="whitespace-pre-wrap text-[13px]">{b.rawText}</p>
                  </blockquote>
                ))}
            </div>
          )}
        </div>
      </section>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await reviewFileAction(dealId, versionId, {
              record_id: recordId,
              segments: rows,
              note,
              manual_filing: unreadable,
              force_current: force,
            });
            setMessage("Document details saved. The file has been checked again.");
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="card-head">
          <div className="min-w-0">
            <h2 className="text-[17px]">
              {unreadable ? "Manual filing" : "Edit document details"}
            </h2>
            {editable && !unreadable ? (
              <p className="meta mt-1">
                Type, person, period and signature as filed. Change them only if they were read
                wrongly; saving keeps the earlier version.
              </p>
            ) : null}
          </div>
          <span className="pill pill-quiet">
            {rows.length} {rows.length === 1 ? "document" : "documents"}
          </span>
        </div>
        <div className="card-body flush">
          {rows.map((r, i) =>
            !editable ? (
              <article key={i} className="rowline">
                <h3>{documentName(r.doc_type)}</h3>
                <p className="meta">
                  {parties.find((p) => p.id === r.party_id)?.name ?? "Unassigned"} ·{" "}
                  {r.period ?? "No period"}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="eyebrow">Pages</dt>
                    <dd>
                      {r.page_start}–{r.page_end}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Signature / date</dt>
                    <dd>
                      {r.signed === null
                        ? "Uncertain"
                        : r.signed
                          ? "Signature recorded"
                          : "No signature recorded"}{" "}
                      · {r.signature_date ?? "Date not confirmed"}
                    </dd>
                  </div>
                </dl>
                <blockquote className="mt-3 italic">{r.quote}</blockquote>
                <button
                  type="button"
                  className="btn btn-sm mt-3"
                  onClick={() => setPage(r.page_start)}
                >
                  Show page {r.page_start}
                </button>
              </article>
            ) : (
              <fieldset
                disabled={!editable}
                key={i}
                className="rowline grid grid-cols-2 gap-3 text-[13.5px]"
              >
                <legend className="sr-only">Segment {i + 1}</legend>
                <h3 className="col-span-2">Segment {i + 1}</h3>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">First page</span>
                  <input
                    aria-label={`Segment ${i + 1} first page`}
                    className="w-full"
                    type="number"
                    min={1}
                    max={pages || 100}
                    value={r.page_start}
                    onChange={(e) => update(i, { page_start: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Last page</span>
                  <input
                    aria-label={`Segment ${i + 1} last page`}
                    className="w-full"
                    type="number"
                    min={1}
                    max={pages || 100}
                    value={r.page_end}
                    onChange={(e) => update(i, { page_end: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Type</span>
                  <select
                    aria-label={`Segment ${i + 1} type`}
                    className="w-full"
                    value={r.doc_type}
                    onChange={(e) => update(i, { doc_type: e.target.value as Row["doc_type"] })}
                  >
                    {KNOWN_DOCUMENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Party</span>
                  <select
                    aria-label={`Segment ${i + 1} party`}
                    className="w-full"
                    value={r.party_id ?? ""}
                    onChange={(e) => update(i, { party_id: e.target.value || null })}
                  >
                    <option value="">Unknown / outside deal</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Period</span>
                  <input
                    aria-label={`Segment ${i + 1} period`}
                    className="w-full"
                    placeholder="Unknown"
                    value={r.period ?? ""}
                    onChange={(e) =>
                      update(i, {
                        period: e.target.value || null,
                        period_raw: e.target.value || null,
                      })
                    }
                  />
                </label>
                {(["signed", "dated"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="eyebrow">{key === "signed" ? "Signed" : "Dated"}</span>
                    <select
                      aria-label={`Segment ${i + 1} ${key}`}
                      className="w-full"
                      value={r[key] === null ? "unknown" : String(r[key])}
                      onChange={(e) =>
                        update(i, {
                          [key]: e.target.value === "unknown" ? null : e.target.value === "true",
                        })
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                ))}
                {(
                  ["signature_date", "document_date", "form_revision", "account_last_four"] as const
                ).map((key) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="eyebrow">{key.replaceAll("_", " ")}</span>
                    <input
                      className="w-full"
                      value={r[key] ?? ""}
                      onChange={(e) => update(i, { [key]: e.target.value || null })}
                    />
                  </label>
                ))}
                <blockquote className="col-span-2 rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] italic">
                  {r.quote}
                </blockquote>
                <div className="col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setPage(r.page_start)}
                  >
                    Show page {r.page_start}
                  </button>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      Remove segment
                    </button>
                  )}
                </div>
              </fieldset>
            ),
          )}
        </div>
        {editable && (
          <div className="card-body border-t border-[var(--line)] space-y-3">
            {!unreadable && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      ...empty,
                      doc_type: "OTHER_NOT_REQUIRED",
                      page_start: (rows.at(-1)?.page_end ?? 0) + 1,
                      page_end: pages,
                    },
                  ])
                }
              >
                Add segment
              </button>
            )}
            {conflict && (
              <label className="flex items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />
                Keep this version as current (recorded in audit)
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Reason / review note (required)</span>
              <textarea
                aria-label="Review note"
                required
                rows={3}
                className="w-full"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button disabled={busy} className="btn btn-primary">
              {busy ? "Saving…" : unreadable ? "File manually" : "Save document details"}
            </button>
            <p role="status" className="meta min-h-[1.2em]" aria-live="polite">
              {message}
            </p>
          </div>
        )}
        {!editable ? (
          <p role="status" className="card-body meta" aria-live="polite">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
