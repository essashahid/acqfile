"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDealAction } from "./actions";
import type { DealDraft } from "@/lib/deals/service";
import { PARTY_ROLES } from "@/lib/domain/profile";
type Value = string | number | boolean | null | Value[] | { [k: string]: Value };
const enums: Record<string, string[]> = {
  transaction_category: [
    "initial_acquisition",
    "business_expansion",
    "owner_buyout",
    "esop_cooperative",
    "other",
    "unknown",
  ],
  structure: ["asset", "stock", "unknown"],
  premises: ["leased", "owned", "none", "unknown"],
  kind: ["individual", "entity", "unknown"],
  roles: [...PARTY_ROLES],
  stage: ["pre_closing", "post_closing", "unknown"],
  origin: ["declared", "extracted", "unknown"],
  present: ["yes", "no", "unknown"],
  real_estate_included: ["yes", "no", "unknown"],
  franchise: ["yes", "no", "unknown"],
  gift_funds: ["yes", "no", "unknown"],
  minority_investor_equity: ["yes", "no", "unknown"],
  counted_toward_injection: ["yes", "no", "unknown"],
  jointly_held_assets: ["yes", "no", "unknown"],
};
const templates: Record<string, Value> = {
  seller_note: {
    present: "unknown",
    amount: "unknown",
    counted_toward_injection: "unknown",
  },
  seller_staying: { present: "unknown", role: "unknown", months: "unknown" },
  paid_agents: [],
  equity_sources: [],
  affiliates: [],
  name_variants: [],
  identifier: { hmac: "", last_four: "" },
};
const item: Record<string, Value> = {
  parties: {
    id: "party-new",
    kind: "unknown",
    roles: ["unknown"],
    legal_name: "unknown",
    name_variants: [],
    identifier: null,
    jointly_held_assets: "unknown",
    affiliates: "unknown",
  },
  ownership: {
    owner_party_id: "",
    owned_party_id: "",
    percent: "unknown",
    stage: "unknown",
    origin: "declared",
  },
  paid_agents: {
    id: "agent-new",
    party: "unknown",
    name: "unknown",
    role: "unknown",
    paid_by: "unknown",
    amount: "unknown",
  },
  equity_sources: {
    id: "source-new",
    party: "unknown",
    kind: "unknown",
    amount: "unknown",
    source_account_last_four: "unknown",
  },
};
const label = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function Fields({
  value,
  onChange,
  name,
  path,
  parties = [],
}: {
  value: Value;
  onChange: (v: Value) => void;
  name: string;
  path: string;
  parties?: { id: string; legal_name: string }[];
}) {
  const input = "w-full";
  if (Array.isArray(value))
    return (
      <fieldset className="col-span-full rounded-xl border border-[var(--line)] p-4 space-y-4">
        <legend>{label(name)}</legend>
        {value.map((v, i) => (
          <div key={i} className="flex gap-2">
            <div className="flex-1">
              <Fields
                value={v}
                name={name === "roles" ? "roles" : `${name} ${i + 1}`}
                parties={parties}
                path={`${path}.${i}`}
                onChange={(next) => onChange(value.map((old, j) => (i === j ? next : old)))}
              />
            </div>
            <button type="button" onClick={() => onChange(value.filter((_, j) => i !== j))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="underline"
          onClick={() => onChange([...value, structuredClone(item[name] ?? "unknown")])}
        >
          Add {label(name)}
        </button>
        {name !== "parties" &&
          name !== "ownership" &&
          name !== "roles" &&
          name !== "name_variants" && (
            <button type="button" className="ml-3 underline" onClick={() => onChange("unknown")}>
              Unknown
            </button>
          )}
      </fieldset>
    );
  if (value && typeof value === "object")
    return (
      <fieldset className="col-span-full rounded-xl border border-[var(--line)] p-4 grid gap-4 sm:grid-cols-2">
        <legend>{label(name)}</legend>
        {Object.entries(value).map(([k, v]) => (
          <Fields
            key={k}
            value={v}
            name={k}
            parties={parties}
            path={`${path}.${k}`}
            onChange={(next) => onChange({ ...value, [k]: next })}
          />
        ))}
        {templates[name] && (
          <button type="button" onClick={() => onChange(name === "identifier" ? null : "unknown")}>
            Mark unknown
          </button>
        )}
      </fieldset>
    );
  if (templates[name] && (value === null || value === "unknown"))
    return (
      <div>
        <span>{label(name)}: unknown</span>
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => onChange(structuredClone(templates[name]!))}
        >
          Enter {label(name)}
        </button>
      </div>
    );
  const numeric = ["purchase_price", "total_project_cost", "amount", "months", "percent"].includes(
    name,
  );
  const choices =
    name === "kind" && path.includes("equity_sources")
      ? [
          "cash",
          "gift",
          "seller_standby_note",
          "other_standby_debt",
          "minority_investor_equity",
          "other",
          "unknown",
        ]
      : enums[name];
  return (
    <label className="block text-sm">
      {label(name)}
      {["owner_party_id", "owned_party_id", "party"].includes(name) ? (
        <select
          aria-label={path}
          className={input}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose a party</option>
          <option value="unknown">Unknown</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.legal_name}
            </option>
          ))}
        </select>
      ) : choices ? (
        <select
          aria-label={path}
          className={input}
          value={String(value ?? "unknown")}
          onChange={(e) => onChange(e.target.value)}
        >
          {choices.map((v) => (
            <option key={v} value={v}>
              {label(v)}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={path}
          className={input}
          value={value === null ? "" : String(value)}
          onChange={(e) =>
            onChange(
              numeric &&
                e.target.value !== "" &&
                e.target.value !== "unknown" &&
                Number.isFinite(Number(e.target.value))
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
const unknownProfile = {
  transaction_category: "unknown",
  structure: "unknown",
  purchase_price: "unknown",
  total_project_cost: "unknown",
  real_estate_included: "unknown",
  premises: "unknown",
  franchise: "unknown",
  franchise_brand: "unknown",
  seller_note: "unknown",
  gift_funds: "unknown",
  minority_investor_equity: "unknown",
  seller_staying: "unknown",
  target_lender: "unknown",
  expected_loan_number_date: "unknown",
  target_submission_date: "unknown",
  paid_agents: "unknown",
  equity_sources: "unknown",
};
export function DealEditor({
  initial,
  id,
  revision,
}: {
  initial?: DealDraft;
  id?: string;
  revision?: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Value>(
    (initial ?? {
      code: "",
      name: "",
      as_of: "2026-09-15",
      profile: unknownProfile,
      parties: [],
      ownership: [],
    }) as Value,
  );
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <details>
        <summary className="link cursor-pointer">Advanced: import a profile</summary>
        <label className="block">
          Profile JSON
          <textarea
            aria-label="Profile JSON"
            className="border rounded w-full h-36 font-mono text-xs"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            try {
              const d = JSON.parse(json);
              setValue({
                code: d.code ?? d.id ?? "",
                name:
                  d.name ??
                  d.parties?.find((p: { roles: string[] }) => p.roles.includes("seller_entity"))
                    ?.legal_name ??
                  "",
                as_of: d.as_of,
                profile: d.profile,
                parties: d.parties,
                ownership: d.ownership,
                ...(d.overlay ? { overlay: d.overlay } : {}),
              });
              setError("");
            } catch {
              setError("Enter valid profile JSON.");
            }
          }}
        >
          Load JSON
        </button>
      </details>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const saved = await saveDealAction(value, id, revision);
            router.push(`/staff/deals/${saved}`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save deal");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Fields
          value={value}
          name="Deal profile and parties"
          path="deal"
          parties={(value as { parties?: { id: string; legal_name: string }[] }).parties ?? []}
          onChange={setValue}
        />
        <p role="alert" className="text-red-700 whitespace-pre-wrap">
          {error}
        </p>
        <button disabled={busy} className="btn btn-primary mt-4">
          {busy ? "Saving…" : "Save deal"}
        </button>
      </form>
    </div>
  );
}
