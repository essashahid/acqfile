"use client";
import { SourceEditor, ValueEditor, type SourceDraft } from "./ValueEditor";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  enterManualFactAction,
  reviewFactAction,
  resolveGapAction,
  reclassifyAction,
} from "./actions";
import { PdfPage } from "./PdfPage";
import { attentionKind, attributeName, factValue } from "@/lib/staff/labels";
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
  /** The form field the value was read from, when the document is an official form. */
  field?: string;
  widget?: number;
  recordVersion: number;
  reviewNote: string | null;
};
export type ReviewGap = {
  id: string;
  type: string;
  attribute: string | null;
  reason: string;
  /** Where the value should be, from the official form's field map. */
  field?: string;
  page?: number;
};
const PENDING = ["review", "blocked", "needs_source"];
/** The editable field keeps the raw JSON; everything read-only shows the display form. */
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const ROUTING: Record<string, string> = {
  review: "Needs review",
  blocked: "Blocked",
  needs_source: "Needs a better copy",
};
const name = (attribute: string) => attributeName(attribute).split(" · ").at(-1)!;
const outcome = (f: ReviewFact) =>
  [
    f.method === "acroform"
      ? "read from form field"
      : f.method === "manual"
        ? "entered by staff"
        : "read from the document",
    f.routing === "auto_accepted"
      ? "accepted automatically"
      : f.routing === "accepted"
        ? "accepted by staff"
        : f.routing.replaceAll("_", " "),
  ].join(" · ");

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

type Item = { key: string; page: number; field?: string; widget?: number; label: string } & (
  | { kind: "fact"; fact: ReviewFact }
  | { kind: "gap"; gap: ReviewGap }
);

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
  availableAttributes,
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
  /** Catalog values this document type can state that have no current record yet. */
  availableAttributes: string[];
  editable: boolean;
}) {
  const router = useRouter();
  const pending = facts.filter((f) => PENDING.includes(f.routing));
  const decided = facts.filter((f) => !PENDING.includes(f.routing));
  // Values still to check come first, in the order a stepper walks them.
  const items: Item[] = [
    ...pending.map(
      (f): Item => ({
        key: `f:${f.id}`,
        kind: "fact",
        fact: f,
        page: f.page,
        field: f.field,
        widget: f.widget,
        label: name(f.attribute),
      }),
    ),
    ...gaps.map(
      (g): Item => ({
        key: `g:${g.id}`,
        kind: "gap",
        gap: g,
        page: g.page ?? pageStart,
        field: g.field,
        label: g.attribute ? name(g.attribute) : "This document",
      }),
    ),
  ];
  const opening = items[0] ?? decided[0];
  const [active, setActive] = useState<string | null>(items[0]?.key ?? null);
  const [view, setView] = useState<{
    page: number;
    field?: string;
    widget?: number;
    label?: string;
  }>(() => ({
    page: opening?.page ?? pageStart,
    field: opening?.field,
    widget: opening?.widget,
    label: items[0]?.label ?? (decided[0] ? name(decided[0].attribute) : undefined),
  }));
  const page = view.page;
  const setPage = (p: number) => setView({ page: p });
  const focus = (x: { page: number; field?: string; widget?: number }, label: string) =>
    setView({ page: x.page, field: x.field, widget: x.widget, label });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, SourceDraft>>({});
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [manualAttribute, setManualAttribute] = useState("");
  const sourceFor = (id: string, at = page): SourceDraft =>
    sources[id] ?? { page: at, quote: "", kind: "quote", region: "" };
  const sourceInput = (id: string) => ({
    ...sourceFor(id),
    region: sourceFor(id).region || undefined,
  });
  const sourceEditor = (id: string, label: string, at?: number) => (
    <SourceEditor
      label={label}
      value={sourceFor(id, at)}
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
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
      return false;
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
  const current = items.find((i) => i.key === active) ?? items[0];
  const at = current ? items.indexOf(current) : -1;
  const select = (item: Item | undefined) => {
    if (!item) return;
    setActive(item.key);
    setCorrecting(null);
    focus(item, item.label);
  };
  const itemPages = new Set(items.map((i) => i.page));
  const chip = (p: number, onClick: () => void) => (
    <button type="button" className="page-chip" onClick={onClick} aria-label={`Show page ${p}`}>
      P. {p}
    </button>
  );

  return (
    <div className="vr">
      <section className="vr-values" aria-label="Values">
        <div className="vr-sec">
          <h2>To review</h2>
          <span className="num">{items.length}</span>
          {items.length > 1 ? (
            <span className="vr-step">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous value to review"
                disabled={at <= 0}
                onClick={() => select(items[at - 1])}
              >
                <ChevronLeft size={15} aria-hidden />
              </button>
              <b>
                {at + 1} of {items.length}
              </b>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next value to review"
                disabled={at >= items.length - 1}
                onClick={() => select(items[at + 1])}
              >
                <ChevronRight size={15} aria-hidden />
              </button>
            </span>
          ) : null}
        </div>

        {items.map((item) => {
          const open = item.key === current?.key;
          const aria =
            item.kind === "fact"
              ? `Pending ${item.fact.attribute}`
              : `Gap ${item.gap.attribute ?? item.gap.type}`;
          return (
            <fieldset
              key={item.key}
              disabled={busy}
              className={`vr-item ${open ? "is-open" : ""}`}
              aria-label={aria}
            >
              <legend className="sr-only">{aria}</legend>
              <button
                type="button"
                className="vr-item-head"
                aria-expanded={open}
                onClick={() => select(item)}
              >
                <span className="mk mk-yours" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="vr-item-title">{item.label}</span>
                  <span className="vr-item-sub">
                    {item.kind === "fact"
                      ? attributeName(item.fact.attribute).split(" · ")[0]
                      : item.gap.attribute
                        ? attributeName(item.gap.attribute).split(" · ")[0]
                        : "Document"}
                    <span className="page-chip is-static">P. {item.page}</span>
                  </span>
                </span>
                <span className="tag-warn">
                  {item.kind === "fact"
                    ? (ROUTING[item.fact.routing] ?? item.fact.routing)
                    : item.gap.type === "extraction_gap"
                      ? "Not read"
                      : attentionKind(item.gap.type)}
                </span>
              </button>

              {open && item.kind === "fact" ? (
                <div className="vr-item-body">
                  <p className="vr-value" data-testid={`value-${item.fact.attribute}`}>
                    {display(item.fact)}
                  </p>
                  <blockquote className="vr-quote">
                    <span>
                      “{item.fact.quote}”{item.fact.verbatim ? "" : " (as read, not verbatim)"}
                    </span>
                    {chip(item.fact.page, () => focus(item, item.label))}
                  </blockquote>
                  <details className="reveal">
                    <summary>How this value was checked</summary>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="eyebrow">Confidence</span>
                      <span className="text-[15px] font-semibold tabular-nums">
                        {item.fact.confidence.toFixed(2)}
                      </span>
                    </div>
                    <Components components={item.fact.components} />
                    {item.fact.verifierReason ? (
                      <p className="meta mt-2">
                        <span className="eyebrow">Verifier</span> {item.fact.verifierReason}
                      </p>
                    ) : null}
                    {item.fact.correctedValue !== null && item.fact.correctedValue !== undefined ? (
                      <p className="mt-1.5 text-[13px]">
                        <span className="eyebrow">Suggested</span>{" "}
                        <span>{display(item.fact, item.fact.correctedValue)}</span>
                      </p>
                    ) : null}
                    {item.fact.validation.length ? (
                      <p className="meta mt-1.5">
                        <span className="eyebrow">Checks</span> {item.fact.validation.join(", ")}
                      </p>
                    ) : null}
                  </details>
                  {editable ? (
                    <>
                      {correcting === item.fact.id ? (
                        <div className="space-y-3">
                          <ValueEditor
                            attribute={item.fact.attribute}
                            value={edits[item.fact.id] ?? show(item.fact.value)}
                            onChange={(v) => setEdits({ ...edits, [item.fact.id]: v })}
                          />
                          {sourceEditor(item.fact.id, item.fact.attribute, item.fact.page)}
                        </div>
                      ) : null}
                      <label className="flex flex-col gap-1">
                        <span className="eyebrow">Reason (required)</span>
                        <input
                          aria-label={`Comment ${item.fact.attribute}`}
                          required
                          value={comments[item.fact.id] ?? ""}
                          onChange={(e) =>
                            setComments({ ...comments, [item.fact.id]: e.target.value })
                          }
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {correcting === item.fact.id ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => decide(item.fact, "edit_accept")}
                          >
                            Save correction
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => decide(item.fact, "accept")}
                          >
                            Accept
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-expanded={correcting === item.fact.id}
                          onClick={() =>
                            setCorrecting(correcting === item.fact.id ? null : item.fact.id)
                          }
                        >
                          {correcting === item.fact.id ? "Cancel correction" : "Correct value"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => decide(item.fact, "reject")}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => decide(item.fact, "needs_source")}
                        >
                          Needs a better copy
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="meta">Awaiting an operator decision.</p>
                  )}
                </div>
              ) : null}

              {open && item.kind === "gap" ? (
                <div className="vr-item-body">
                  <p className="meta">
                    {item.gap.type === "extraction_gap"
                      ? "A rule uses this value, but nothing was read."
                      : item.gap.reason}
                  </p>
                  {item.gap.type === "extraction_gap" && editable ? (
                    <>
                      <ValueEditor
                        attribute={item.gap.attribute!}
                        label="Enter value"
                        value={edits[item.gap.id] ?? ""}
                        onChange={(v) => setEdits({ ...edits, [item.gap.id]: v })}
                      />
                      {sourceEditor(item.gap.id, item.gap.attribute!, item.page)}
                      <label className="flex flex-col gap-1">
                        <span className="eyebrow">Reason</span>
                        <input
                          aria-label={`Gap comment ${item.gap.attribute}`}
                          value={comments[item.gap.id] ?? ""}
                          onChange={(e) =>
                            setComments({ ...comments, [item.gap.id]: e.target.value })
                          }
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            run("Value entered", () =>
                              resolveGapAction(dealId, {
                                review_id: item.gap.id,
                                action: "enter",
                                value: edits[item.gap.id],
                                source: sourceInput(item.gap.id),
                                comment: comments[item.gap.id] ?? "",
                              }),
                            )
                          }
                        >
                          Save value
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            run("Item dismissed", () =>
                              resolveGapAction(dealId, {
                                review_id: item.gap.id,
                                action: "dismiss",
                                comment: comments[item.gap.id] ?? "",
                              }),
                            )
                          }
                        >
                          Not in the document
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          );
        })}
        {!items.length ? <p className="vr-empty">Nothing to review on this document.</p> : null}

        <div className="vr-sec">
          <h2>Decided values</h2>
          <span className="num">{decided.length}</span>
        </div>
        {decided.map((f) => (
          <fieldset
            key={f.id}
            disabled={busy}
            aria-label={`Decision ${f.attribute}`}
            className="vr-dec"
          >
            <legend className="sr-only">{`Decision ${f.attribute}`}</legend>
            <div className="vr-dec-row">
              {f.routing === "rejected" ? (
                <span className="vr-dec-mark" aria-label="Rejected">
                  ×
                </span>
              ) : (
                <Check size={15} className="vr-dec-mark is-ok" aria-label="Decided" />
              )}
              <span className="min-w-0 flex-1">
                <span className="vr-dec-name">{name(f.attribute)}</span>
                <span className="vr-dec-how">{outcome(f)}</span>
              </span>
              <span className="vr-dec-value">
                <span>{display(f)}</span>
                {chip(f.page, () => focus(f, name(f.attribute)))}
              </span>
              {editable ? (
                <button
                  type="button"
                  className="link text-[13px]"
                  aria-expanded={changing === f.id}
                  onClick={() => {
                    setChanging(changing === f.id ? null : f.id);
                    setCorrecting(null);
                  }}
                >
                  Change
                </button>
              ) : null}
            </div>
            {f.reviewNote ? <p className="meta pl-7">{f.reviewNote}</p> : null}
            {editable && changing === f.id ? (
              <div className="vr-change">
                <blockquote className="vr-quote">
                  <span>
                    “{f.quote}”{f.verbatim ? "" : " (as read, not verbatim)"}
                  </span>
                </blockquote>
                {correcting === f.id ? (
                  <>
                    <ValueEditor
                      attribute={f.attribute}
                      value={edits[f.id] ?? show(f.value)}
                      onChange={(v) => setEdits({ ...edits, [f.id]: v })}
                    />
                    {sourceEditor(f.id, f.attribute, f.page)}
                  </>
                ) : null}
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Reason (required)</span>
                  <input
                    aria-label={`Decision reason ${f.attribute}`}
                    value={comments[f.id] ?? ""}
                    onChange={(e) => setComments({ ...comments, [f.id]: e.target.value })}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {correcting === f.id ? (
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => decide(f, "edit_accept")}
                    >
                      Save correction
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setCorrecting(f.id)}
                    >
                      Correct value
                    </button>
                  )}
                  <button className="btn btn-sm" type="button" onClick={() => decide(f, "reopen")}>
                    Reopen review
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => decide(f, "reject")}>
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </fieldset>
        ))}
        {!decided.length ? <p className="vr-empty">Nothing decided yet.</p> : null}

        {editable && availableAttributes.length ? (
          <section className="vr-add">
            <h2>Add a value from this document</h2>
            <p className="meta">
              When the document states a relevant value but no item was created for it. Page and
              source text are required.
            </p>
            <fieldset disabled={busy} className="space-y-3" aria-label="Add document value">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Value to add</span>
                <select
                  aria-label="Value to add"
                  value={manualAttribute}
                  onChange={(e) => setManualAttribute(e.target.value)}
                >
                  <option value="">Choose a value from this document</option>
                  {availableAttributes.map((attribute) => (
                    <option key={attribute} value={attribute}>
                      {attributeName(attribute)}
                    </option>
                  ))}
                </select>
              </label>
              {manualAttribute ? (
                <>
                  <ValueEditor
                    attribute={manualAttribute}
                    label="Value"
                    value={edits[`manual-${manualAttribute}`] ?? ""}
                    onChange={(value) =>
                      setEdits({ ...edits, [`manual-${manualAttribute}`]: value })
                    }
                  />
                  {sourceEditor(`manual-${manualAttribute}`, manualAttribute)}
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow">Reason (required)</span>
                    <input
                      aria-label={`Manual value reason ${manualAttribute}`}
                      value={comments[`manual-${manualAttribute}`] ?? ""}
                      onChange={(e) =>
                        setComments({
                          ...comments,
                          [`manual-${manualAttribute}`]: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const attribute = manualAttribute;
                      const key = `manual-${attribute}`;
                      void (async () => {
                        const saved = await run("Value entered", () =>
                          enterManualFactAction(dealId, segmentId, {
                            attribute,
                            value: edits[key],
                            source: sourceInput(key),
                            comment: comments[key] ?? "",
                          }),
                        );
                        if (saved) setManualAttribute("");
                      })();
                    }}
                  >
                    Save value from document
                  </button>
                </>
              ) : null}
            </fieldset>
          </section>
        ) : null}

        {history.length ? (
          <details className="vr-more">
            <summary>Earlier value records ({history.length})</summary>
            <h3 className="mt-3">Value history</h3>
            <p className="meta mt-2">
              Earlier records are preserved; only current accepted values feed the file checks.
            </p>
            <ul className="mt-2 space-y-3">
              {history.map((f) => (
                <li key={f.id}>
                  <p className="font-semibold">{attributeName(f.attribute)}</p>
                  <p>
                    {display(f)}{" "}
                    <span className="meta">
                      · Version {f.recordVersion} · {f.routing.replaceAll("_", " ")}
                    </span>
                  </p>
                  {f.reviewNote ? <p className="meta">{f.reviewNote}</p> : null}
                  <blockquote className="meta mt-1 italic">{f.quote}</blockquote>
                  {chip(f.page, () => setPage(f.page))}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {editable ? (
          <details className="vr-more">
            <summary>Send back to filing</summary>
            <p className="meta mt-2">Its values stop counting until the document is filed again.</p>
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("Sent back to filing", async () => {
                  const version = await reclassifyAction(dealId, segmentId, reclassifyNote);
                  router.push(`/staff/deals/${dealId}/documents/${version}`);
                });
              }}
            >
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
                <span className="eyebrow">Reason (required)</span>
                <input
                  aria-label="Reclassify reason"
                  required
                  value={reclassifyNote}
                  onChange={(e) => setReclassifyNote(e.target.value)}
                />
              </label>
              <button disabled={busy} className="btn btn-sm">
                Reclassify this document
              </button>
            </form>
          </details>
        ) : null}

        <p role="status" className="meta min-h-[1.2em] px-1" aria-live="polite">
          {message}
        </p>
        <p className="sr-only">Version {versionId}</p>
      </section>

      <section className="card vr-source" aria-label="Source document">
        <div className="vr-tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous page"
            disabled={page <= pageStart}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <label className="flex items-center gap-1.5 text-[13px] font-semibold">
            Page
            <input
              aria-label="Source page"
              type="number"
              min={pageStart}
              max={pageEnd}
              className="w-16"
              value={page}
              onChange={(e) =>
                setPage(Math.min(pageEnd, Math.max(pageStart, Number(e.target.value))))
              }
            />
            <span className="meta">of {pageEnd}</span>
          </label>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next page"
            disabled={page >= pageEnd}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={15} aria-hidden />
          </button>
          {pageEnd > pageStart ? (
            <span className="vr-pages" aria-label="Pages">
              {Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`vr-page ${p === page ? "is-on" : ""}`}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}${itemPages.has(p) ? ", has values to review" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                  {itemPages.has(p) ? <i aria-hidden /> : null}
                </button>
              ))}
            </span>
          ) : null}
          <span className="meta ml-auto">
            {url ? "Unmasked original" : "Masked text · originals need an operator account"}
          </span>
          {url ? (
            <a href={url} className="link inline-flex items-center gap-1 text-[13px]">
              Open original
              <ExternalLink size={13} aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="vr-canvas" data-scroll>
          {url && pdf ? (
            <PdfPage
              url={url}
              page={page}
              field={view.field}
              widget={view.widget}
              label={view.label}
            />
          ) : (
            <div className="space-y-2">
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
    </div>
  );
}
