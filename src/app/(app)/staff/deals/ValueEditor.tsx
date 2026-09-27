"use client";
import { FACTS } from "@/lib/domain/registry";
/** Editors only for the existing ownership and sources/uses catalog shapes. */
export function ValueEditor({
  attribute,
  value,
  onChange,
  label = "Edit value",
}: {
  attribute: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const type = FACTS[attribute]?.value_type;
  if (type !== "owners" && type !== "amounts")
    return (
      <label className="flex flex-col gap-1">
        <span className="eyebrow">{label}</span>
        <input
          aria-label={`${label} ${attribute}`}
          placeholder={type === "date" ? "YYYY-MM-DD or MM/DD/YYYY (US)" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    /* an empty gap starts with no rows */
  }
  const name = type === "owners" ? "name" : "label";
  const amount = type === "owners" ? "percent" : "amount";
  const update = (i: number, key: string, v: string) =>
    onChange(JSON.stringify(rows.map((r, j) => (i === j ? { ...r, [key]: v } : r))));
  return (
    <fieldset className="space-y-2">
      <legend className="eyebrow">{label}</legend>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <label>
            {type === "owners" ? "Owner name" : "Description"}
            <input
              aria-label={`${attribute} ${name} ${i + 1}`}
              value={String(row[name] ?? "")}
              onChange={(e) => update(i, name, e.target.value)}
            />
          </label>
          <label>
            {type === "owners" ? "Ownership %" : "Amount (USD)"}
            <input
              inputMode="decimal"
              aria-label={`${attribute} ${amount} ${i + 1}`}
              value={String(row[amount] ?? "")}
              onChange={(e) => update(i, amount, e.target.value)}
            />
          </label>
          {type === "owners" ? (
            <label>
              Title
              <input
                aria-label={`${attribute} title ${i + 1}`}
                value={String(row.title ?? "")}
                onChange={(e) => update(i, "title", e.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="btn btn-sm"
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(JSON.stringify(rows.filter((_, j) => j !== i)))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onChange(JSON.stringify([...rows, { [name]: "", [amount]: "" }]))}
      >
        Add row
      </button>
    </fieldset>
  );
}
export type SourceDraft = {
  page: number;
  quote: string;
  kind: "quote" | "transcription";
  region: string;
};
export function SourceEditor({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: SourceDraft;
  onChange: (v: SourceDraft) => void;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <fieldset className="source-edit">
      <legend className="eyebrow">Where it is on the page</legend>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold">Page</span>
        <input
          aria-label={`Supporting page ${label}`}
          type="number"
          min={min}
          max={max}
          value={value.page}
          onChange={(e) => onChange({ ...value, page: Number(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold">Source text</span>
        <select
          aria-label={`Source text type ${label}`}
          value={value.kind}
          onChange={(e) => onChange({ ...value, kind: e.target.value as SourceDraft["kind"] })}
        >
          <option value="quote">Exact quote</option>
          <option value="transcription">Transcription, not verbatim</option>
        </select>
      </label>
      <label className="source-edit-wide flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold">
          {value.kind === "quote" ? "Quote" : "Transcription"}
        </span>
        <textarea
          aria-label={`Source quote ${label}`}
          rows={2}
          placeholder="Text as it appears on the page"
          value={value.quote}
          onChange={(e) => onChange({ ...value, quote: e.target.value })}
        />
      </label>
      {value.kind === "transcription" ? (
        <label className="source-edit-wide flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold">Region on the page</span>
          <input
            aria-label={`Source region ${label}`}
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          />
        </label>
      ) : null}
    </fieldset>
  );
}
