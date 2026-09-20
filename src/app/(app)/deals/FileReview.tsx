"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_TYPES } from "@/lib/domain/registry";
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
  blocks: { locator: string; rawText: string }[];
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
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-w-0">
        <div className="flex gap-3 mb-3 items-center">
          <h2 className="font-semibold">Source</h2>
          <label>
            Page{" "}
            <input
              aria-label="Source page"
              type="number"
              min={1}
              max={pages || 1}
              className="w-16 border"
              value={page}
              onChange={(e) => setPage(Math.min(pages || 1, Math.max(1, Number(e.target.value))))}
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
        {url && pdf && !unreadable ? (
          <PdfPage url={url} page={page} />
        ) : unreadable ? (
          <p>
            This file could not be opened. Manual filing records its place in the index; it supplies
            no evidence.
          </p>
        ) : (
          <div className="max-h-[750px] overflow-auto space-y-2">
            {blocks.map((b, i) => (
              <blockquote key={i} className="border-l-2 pl-3 whitespace-pre-wrap text-sm">
                <small>{b.locator}</small>
                <p>{b.rawText}</p>
              </blockquote>
            ))}
          </div>
        )}
      </section>
      <form
        className="space-y-4"
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
            setMessage("Filing saved");
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="font-semibold">{unreadable ? "Manual filing" : "Segments and filing"}</h2>
        {rows.map((r, i) => (
          <fieldset
            disabled={!editable}
            key={i}
            className="border rounded p-3 grid grid-cols-2 gap-3 text-sm"
          >
            <legend>Segment {i + 1}</legend>
            <label>
              First page
              <input
                aria-label={`Segment ${i + 1} first page`}
                className="w-full border rounded p-1"
                type="number"
                min={1}
                max={pages || 100}
                value={r.page_start}
                onChange={(e) => update(i, { page_start: Number(e.target.value) })}
              />
            </label>
            <label>
              Last page
              <input
                aria-label={`Segment ${i + 1} last page`}
                className="w-full border rounded p-1"
                type="number"
                min={1}
                max={pages || 100}
                value={r.page_end}
                onChange={(e) => update(i, { page_end: Number(e.target.value) })}
              />
            </label>
            <label>
              Type
              <select
                aria-label={`Segment ${i + 1} type`}
                className="w-full border rounded p-1"
                value={r.doc_type}
                onChange={(e) => update(i, { doc_type: e.target.value as Row["doc_type"] })}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Party
              <select
                aria-label={`Segment ${i + 1} party`}
                className="w-full border rounded p-1"
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
            <label>
              Period
              <input
                aria-label={`Segment ${i + 1} period`}
                className="w-full border rounded p-1"
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
              <label key={key}>
                {key === "signed" ? "Signed" : "Dated"}
                <select
                  aria-label={`Segment ${i + 1} ${key}`}
                  className="w-full border rounded p-1"
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
              <label key={key}>
                {key.replaceAll("_", " ")}
                <input
                  className="w-full border rounded p-1"
                  value={r[key] ?? ""}
                  onChange={(e) => update(i, { [key]: e.target.value || null })}
                />
              </label>
            ))}
            <blockquote className="col-span-2 border-l-2 pl-2">“{r.quote}”</blockquote>
            <button type="button" className="underline" onClick={() => setPage(r.page_start)}>
              Show page {r.page_start}
            </button>
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                Remove segment
              </button>
            )}
          </fieldset>
        ))}
        {editable && (
          <>
            {!unreadable && (
              <button
                type="button"
                className="underline"
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
              <label className="block">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />{" "}
                Keep this version as current (recorded in audit)
              </label>
            )}
            <label className="block">
              Reason / review note
              <textarea
                aria-label="Review note"
                required
                className="w-full border rounded p-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button disabled={busy} className="rounded bg-teal-800 text-white px-4 py-2">
              {busy ? "Saving…" : unreadable ? "File manually" : "Confirm segments"}
            </button>
          </>
        )}
        <p role="status">{message}</p>
      </form>
    </div>
  );
}
