// Authored source data only. This module must never import the engine or parsers.
import { Faker, en } from "@faker-js/faker";
import baseline from "./baseline.json";
import { maskIdentifier } from "../../src/lib/domain/evidence";
import type { DealProfile, Party, Ownership } from "../../src/lib/domain/profile";
import type { DocumentType } from "../../src/lib/domain/registry";
export const FIXTURE_HMAC_KEY = "OBVIOUSLY-FAKE-ACQFILE-FIXTURE-KEY-NOT-FOR-PRODUCTION-2026";
export const AS_OF = "2026-09-15";
export const YEARS = ["2023", "2024", "2025"];
export const MONTHS = ["2026-07", "2026-08"];
export type Format =
  | "text_pdf"
  | "acroform_pdf"
  | "docx"
  | "xlsx"
  | "scan_pdf"
  | "bundle_pdf"
  | "protected_pdf";
export type Doc = {
  id: string;
  type: DocumentType;
  party: string;
  period?: string;
  facts: Record<string, unknown>;
  metadata: Record<string, unknown>;
  batch: number;
  format: Format;
  path: string;
  group?: string;
  duplicate_of?: string;
  supersedes?: string;
  unreadable?: boolean;
  tags: number[];
  notes: string[];
};
export type Row = { item_id: string; scope_key: string; period: string | null; status: string };
export type ExpectedFinding = {
  rule_id: string;
  scope_key: string;
  period: string | null;
  type: string;
  severity: string;
};
export type Plant = {
  item: number | string;
  description: string;
  documents: string[];
  batch: number;
  findings: string[];
  pipeline?: string;
};
export type Trap = { id: string; documents: string[]; rules: string[]; reason: string };
// A43 planted extraction faults. Expected routing is authored from A39 by hand, never copied from engine output.
export const FAULT_KINDS = [
  "wrong_value_real_quote",
  "quote_not_in_block",
  "weak_evidence",
  "verifier_corrects",
  "missing_value",
  "vision_disagreement",
] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];
export type Fault = {
  id: string;
  document: string;
  attribute: string;
  kind: FaultKind;
  expected: "review" | "blocked";
  description: string;
  extractor: { value: unknown; quote: string | null; second_read?: unknown };
  verifier: {
    status: "supported" | "partially_supported" | "unsupported";
    corrected_value: unknown;
    contradiction: boolean;
    specificity: number;
  } | null;
};
export type Model = {
  price: number;
  project: number;
  loan: number;
  cash: number;
  note: number;
  gift: number;
  investor: number;
  years: Record<string, { revenue: number; income: number }>;
  assets: number;
  liabilities: number;
  equity: number;
  personal: { cash: number; assets: number; liabilities: number; netWorth: number };
};
export type Plan = {
  id: string;
  pack: string;
  overlay?: string;
  as_of: string;
  profile: DealProfile;
  parties: Party[];
  ownership: Ownership[];
  model: Model;
  documents: Doc[];
  tracking: string[];
  confirmations: { rule: string; scope: string; key: string }[];
  planted: Plant[];
  traps: Trap[];
  faults: Fault[];
  batches: { batch: number; checklist: Row[]; findings: ExpectedFinding[]; resolves: string[] }[];
};
export const key = (rule: string, scope = "deal", period: string | null = null) =>
  [rule, scope, period].join("|");
export const fakeId = (digits = "00-1234567") => maskIdentifier(digits, FIXTURE_HMAC_KEY);
export function person(seed: number) {
  const f = new Faker({ locale: [en] });
  f.seed(seed);
  return f.person.fullName();
}
export function base(id: "deal-a" | "deal-b" | "deal-c"): Plan {
  const n = id === "deal-a" ? 0 : id === "deal-b" ? 1 : 2;
  const target = [
    "Varnholt Climate Services LLC",
    "Quenby Grounds Management LLC",
    "Ostrelyva Fitness LLC",
  ][n]!;
  const buyer = ["Varnholt Acquisition LLC", "Quenby Acquisition LLC", "Ostrelyva Acquisition LLC"][
    n
  ]!;
  const price = [2400000, 3600000, 850000][n]!;
  const model: Model = {
    price,
    project: price + 100000,
    loan: 0,
    cash: 150000,
    note: n === 0 ? 240000 : n === 1 ? 120000 : 0,
    gift: n === 2 ? 50000 : 0,
    investor: n === 1 ? 90000 : 0,
    years: {
      "2023": { revenue: 1200000, income: 120000 },
      "2024": { revenue: 1300000, income: 130000 },
      "2025": { revenue: 1400000, income: 140000 },
    },
    assets: 500000,
    liabilities: 100000,
    equity: 400000,
    personal: { cash: 180000, assets: 500000, liabilities: 100000, netWorth: 400000 },
  };
  model.loan = model.project - model.cash - model.note - model.gift - model.investor;
  const b = structuredClone(baseline);
  const replacements: Record<string, string> = {
    "Varnholt Climate Services, LLC": target,
    "Varnholt Acquisition LLC": buyer,
    "Kiel McDermott": person(20260915 + n * 10),
  };
  function replace(v: unknown): unknown {
    if (typeof v === "string") return replacements[v] ?? v;
    if (Array.isArray(v)) return v.map(replace);
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, v]) => [k, replace(v)]));
    return v;
  }
  const data = replace(b) as typeof b;
  const profile = data.profile as DealProfile;
  Object.assign(profile, {
    purchase_price: price,
    total_project_cost: model.project,
    structure: n === 1 ? "stock" : "asset",
    premises: n === 0 ? "leased" : "none",
    franchise: n === 2 ? "yes" : "no",
    franchise_brand: n === 2 ? "Ostrelyva" : "none",
    expected_loan_number_date: n === 0 ? "2026-09-29" : "2026-10-30",
    target_submission_date: "2026-09-30",
    target_lender: n === 1 ? "Sample Lender A" : "Zelmivar Bank",
    seller_note: {
      present: model.note ? "yes" : "no",
      amount: model.note,
      counted_toward_injection: model.note ? "yes" : "no",
    },
    gift_funds: n === 2 ? "yes" : "no",
    minority_investor_equity: n === 1 ? "yes" : "no",
    equity_sources: [
      {
        id: "cash-alex",
        party: "alex",
        kind: "cash",
        amount: model.cash,
        source_account_last_four: "4321",
      },
    ],
  });
  const parties = data.parties.map((p) => ({
    ...p,
    name_variants: [],
    identifier: null,
    jointly_held_assets: "no",
    affiliates: [],
  })) as Party[];
  const documents: Doc[] = data.segments.map((s) => ({
    id: s.id,
    type: s.type as DocumentType,
    party: s.party,
    period: "period" in s ? s.period : undefined,
    facts: structuredClone("facts" in s ? s.facts : {}) as Record<string, unknown>,
    metadata: {
      form_revision: null,
      signed: true,
      dated: true,
      signature_date: "2026-08-31",
      document_date: "2026-08-31",
      account_last_four: null,
      ...("metadata" in s ? s.metadata : {}),
    },
    batch: 1,
    format: s.type.startsWith("SBA_") ? "acroform_pdf" : "text_pdf",
    path: "",
    tags: [],
    notes: [],
  }));
  const plan: Plan = {
    id,
    pack: n === 0 ? "sop-50-10-8" : "sop-50-10-8-1",
    ...(n === 1 ? { overlay: "sample-lender-a" } : {}),
    as_of: AS_OF,
    profile,
    parties,
    ownership: data.ownership as Ownership[],
    model,
    documents,
    tracking: data.tracking,
    confirmations: data.confirmations,
    planted: [],
    traps: [],
    faults: [],
    batches: [{ batch: 1, checklist: [], findings: [], resolves: [] }],
  };
  for (const d of documents) {
    if ("party.identifier" in d.facts)
      d.facts["party.identifier"] = fakeId(d.party === "buyer" ? "00-7654321" : "00-1234567");
    if ("deal.purchase_price" in d.facts) d.facts["deal.purchase_price"] = price;
    if (d.type === "PURCHASE_AGREEMENT") d.facts["deal.structure"] = profile.structure;
    if (d.type === "BANK_STATEMENT")
      Object.assign(d.facts, {
        "bank.ending_balance": model.personal.cash,
        "bank.institution": "Zelmivar Bank",
      });
    if (d.type === "SBA_413")
      Object.assign(d.facts, {
        "pfs.cash": model.personal.cash,
        "pfs.total_assets": model.personal.assets,
        "pfs.total_liabilities": model.personal.liabilities,
        "pfs.net_worth": model.personal.netWorth,
      });
    if (d.type === "TAX_BUSINESS")
      Object.assign(d.facts, {
        "tax.net_income": model.years[d.period!]!.income,
        "tax.year": Number(d.period),
        "tax.form_type": "1120S",
      });
    if (d.type === "FIN_YEAR_END") d.facts["financial.net_income"] = model.years[d.period!]!.income;
    if (d.type === "TAX_PERSONAL")
      Object.assign(d.facts, {
        "tax.year": Number(d.period),
        "party.identifier": fakeId("900-12-3456"),
      });
  }
  const sources = [
    { label: "Senior loan", amount: model.loan },
    { label: "Cash injection", amount: model.cash },
    ...(model.note ? [{ label: "Seller note", amount: model.note }] : []),
    ...(model.gift ? [{ label: "Gift", amount: model.gift }] : []),
    ...(model.investor ? [{ label: "Minority investor", amount: model.investor }] : []),
  ];
  Object.assign(doc(plan, "funding").facts, {
    "funding.sources": sources,
    "funding.uses": [
      { label: "Purchase", amount: price },
      { label: "Working capital", amount: 100000 },
    ],
    "funding.sources_total": model.project,
    "funding.uses_total": model.project,
  });
  if (model.note) {
    for (const id of ["loi", "purchase", "funding"])
      Object.assign(doc(plan, id).facts, {
        "deal.seller_note_amount": model.note,
        "deal.seller_note_terms": "Full lifetime standby",
      });
    add(plan, "note", "SELLER_NOTE", "target", {
      "note.principal": model.note,
      "note.term_months": 120,
      "note.full_standby": true,
      "deal.seller_note_terms": "Full lifetime standby",
    });
    plan.tracking.push("TXN-05");
    if (Array.isArray(profile.equity_sources))
      profile.equity_sources.push({
        id: "seller-note",
        party: "target",
        kind: "seller_standby_note",
        amount: model.note,
        source_account_last_four: "9011",
      });
  }
  return plan;
}
export function doc(p: Plan, id: string) {
  const d = p.documents.find((d) => d.id === id);
  if (!d) throw Error(`Unknown ${id}`);
  return d;
}
export function add(
  p: Plan,
  id: string,
  type: DocumentType,
  party: string,
  facts: Record<string, unknown> = {},
  period?: string,
) {
  const d: Doc = {
    id,
    type,
    party,
    facts,
    period,
    metadata: {
      signed: true,
      dated: true,
      signature_date: "2026-08-31",
      document_date: "2026-08-31",
      form_revision: null,
      account_last_four: null,
    },
    batch: 1,
    format: "text_pdf",
    path: "",
    tags: [],
    notes: [],
  };
  p.documents.push(d);
  return d;
}
export function party(
  p: Plan,
  id: string,
  name: string,
  roles: Party["roles"],
  kind: Party["kind"] = "individual",
) {
  p.parties.push({
    id,
    kind,
    roles,
    legal_name: name,
    affiliates: [],
    jointly_held_assets: "no",
    name_variants: [],
    identifier: null,
  });
}
export function owner(p: Plan, id: string, percent: number, owned = "buyer") {
  p.ownership.push({
    owner_party_id: id,
    owned_party_id: owned,
    percent,
    stage: "post_closing",
    origin: "declared",
  });
}
export function setOwners(p: Plan, owners: { name: string; percent: number }[]) {
  for (const id of ["1919", "operating", "owners"])
    doc(p, id).facts["ownership.members"] = structuredClone(owners);
}
export function guarantor(p: Plan, id: string, seed: number) {
  party(p, id, person(seed), ["buyer_owner", "guarantor"]);
  for (const d of [...p.documents].filter((d) => d.party === "alex")) {
    const copy = structuredClone(d);
    copy.id = `${id}-${d.id}`;
    copy.party = id;
    if (copy.type === "BANK_STATEMENT") {
      copy.metadata.account_last_four = "6543";
      copy.facts["party.legal_name"] = person(seed);
    }
    if (copy.type === "TAX_PERSONAL") copy.facts["party.identifier"] = fakeId("901-23-4567");
    p.documents.push(copy);
  }
  p.confirmations.push({ rule: "GUA-05", scope: id, key: "citizenship_handling" });
}
export function fault(p: Plan, f: Fault) {
  p.faults.push(f);
}
export function finding(
  p: Plan,
  rule: string,
  scope = "deal",
  period: string | null = null,
  type = "conflict",
  severity = "major",
) {
  p.batches[0]!.findings.push({ rule_id: rule, scope_key: scope, period, type, severity });
}
export function plant(
  p: Plan,
  item: number | string,
  description: string,
  documents: string[],
  findings: string[] = [],
  pipeline?: string,
) {
  p.planted.push({
    item,
    description,
    documents,
    batch: 1,
    findings,
    ...(pipeline ? { pipeline } : {}),
  });
  for (const id of documents)
    if (p.documents.some((d) => d.id === id) && typeof item === "number")
      doc(p, id).tags.push(item);
}
export function row(
  p: Plan,
  ids: string[],
  scope: string,
  status = "satisfied",
  periods: (string | null)[] = [null],
) {
  for (const item_id of ids)
    for (const period of periods)
      p.batches[0]!.checklist.push({ item_id, scope_key: scope, period, status });
}
// Explicit scenario expectations, not pack evaluation or inferred from evidence.
export function checklist(
  p: Plan,
  guarantors: string[],
  owners: string[],
  sources: { id: string; kind: string }[],
  affiliate?: string,
) {
  row(p, ["TXN-01", "TXN-02", "TXN-03", "TXN-08", "LND-01", "LND-02", "LND-03", "LND-04"], "deal");
  row(p, ["TXN-04", "TXN-05"], "deal", p.id === "deal-c" ? "not_applicable" : "satisfied");
  row(p, ["TXN-06", "RE-01", "RE-02", "RE-03"], "deal", "not_applicable");
  row(p, ["TXN-07"], "none", "not_applicable");
  if (p.id !== "deal-a")
    row(p, ["TXN-09"], "deal", p.id === "deal-b" ? "satisfied" : "not_applicable");
  row(
    p,
    ["ENT-01", "ENT-02", "ENT-03", "ENT-04", "ENT-05", "ENT-06", "ENT-07a", "ENT-07b"],
    "buyer",
  );
  for (const g of guarantors) {
    row(p, ["GUA-01", "GUA-03", "GUA-04", "GUA-06"], g);
    row(p, ["GUA-02"], g, "satisfied", YEARS);
  }
  for (const o of owners) row(p, ["GUA-05"], o);
  for (const s of sources) {
    row(p, ["GUA-07"], s.id, s.kind === "cash" ? "satisfied" : "not_applicable", MONTHS);
    row(
      p,
      ["GUA-08a", "GUA-08b", "GUA-08c"],
      s.id,
      s.kind === "gift" ? "satisfied" : "not_applicable",
    );
  }
  if (affiliate) {
    row(p, ["GUA-09a"], affiliate, "satisfied", YEARS);
    row(p, ["GUA-09b", "GUA-09c"], affiliate);
  } else row(p, ["GUA-09a", "GUA-09b", "GUA-09c"], "none", "not_applicable");
  row(p, ["TGT-01", "TGT-02"], "target", "satisfied", YEARS);
  row(p, ["TGT-03", "TGT-04a", "TGT-04b", "TGT-05", "TGT-06", "TGT-09"], "target");
  row(p, ["TGT-07a", "TGT-07b"], "target", p.id === "deal-a" ? "satisfied" : "not_applicable");
  row(p, ["TGT-08a", "TGT-08b"], "target");
  row(p, ["TGT-10a", "TGT-10b"], "target", p.id === "deal-c" ? "satisfied" : "not_applicable");
  if (p.id === "deal-b") {
    row(p, ["TXN-10a"], "deal");
    row(p, ["TGT-11"], "target");
    row(p, ["TXN-10b", "TXN-10c"], "deal", "not_applicable");
    row(p, ["TGT-12a", "TGT-12b", "TGT-12c"], "target", "not_applicable");
  }
}
export function status(
  p: Plan,
  rule: string,
  scope: string,
  value: string,
  period: string | null = null,
) {
  const r = p.batches[0]!.checklist.find(
    (r) => key(r.item_id, r.scope_key, r.period) === key(rule, scope, period),
  );
  if (!r) throw Error(`Missing authored row ${rule}/${scope}/${period}`);
  r.status = value;
}
export function layout(p: Plan, targetFiles: number) {
  // Bundle related documents first; finish with numbered mixed-document email packets.
  for (const d of p.documents) {
    if (d.duplicate_of) continue;
    if (d.type === "TAX_PERSONAL") d.group = `${d.party}-taxes-b${d.batch}`;
    if (d.type === "TAX_BUSINESS") d.group = `${d.party}-taxes`;
    if (["RESUME", "GOV_ID", "CREDIT_AUTH"].includes(d.type)) d.group = `${d.party}-identity`;
    if (p.id === "deal-c" && d.format === "text_pdf") d.format = "scan_pdf";
  }
  const fileGroups = () => new Set(p.documents.map((d) => d.group ?? d.id)).size;
  let serial = 0;
  while (fileGroups() > targetFiles) {
    const candidates = p.documents.filter(
      (d) =>
        !d.group &&
        d.batch === 1 &&
        !d.duplicate_of &&
        !d.supersedes &&
        !d.unreadable &&
        !d.tags.includes(14) &&
        !["SBA_1919", "SBA_413"].includes(d.type) &&
        ["text_pdf", "scan_pdf"].includes(d.format),
    );
    if (candidates.length < 2) {
      const packets = [
        ...new Set(
          p.documents.filter((d) => d.group?.startsWith("forwarded-packet-")).map((d) => d.group!),
        ),
      ];
      if (packets.length < 2) throw Error("Insufficient bundle candidates");
      for (const d of p.documents) if (d.group === packets[1]) d.group = packets[0];
      continue;
    }
    const group = `forwarded-packet-${++serial}`;
    for (const d of candidates.slice(0, 2)) d.group = group;
  }
  for (const d of p.documents) {
    const group = d.group ?? d.id;
    const grouped = p.documents.filter((x) => (x.group ?? x.id) === group);
    if (grouped.length > 1) d.format = p.id === "deal-c" ? "scan_pdf" : "bundle_pdf";
    const ext = d.format === "docx" ? "docx" : d.format === "xlsx" ? "xlsx" : "pdf";
    d.path = `incoming/batch-${d.batch}/${d.party === "target" ? "Seller/Fwd - closing docs" : "Buyer/Attachments"}/${group}.${serial++ % 2 ? ext.toUpperCase() : ext}`;
    if (grouped.length > 1) {
      const first = grouped[0]!;
      if (first !== d) d.path = first.path;
    }
    if (d.tags.includes(14)) d.path = `incoming/batch-${d.batch}/Phone/scan0007.pdf`;
  }
  for (const d of p.documents) if (d.duplicate_of) d.format = doc(p, d.duplicate_of).format;
  // A36: an official form carries no separate document date. Form 413 is dated by its as-of field, Form 1919 by its signature date; an undated form has none.
  for (const d of p.documents) {
    if (d.type === "SBA_413")
      d.metadata.document_date =
        (d.facts["pfs.as_of_date"] as string | undefined) ??
        (d.metadata.dated ? d.metadata.signature_date : null) ??
        null;
    if (d.type === "SBA_1919")
      d.metadata.document_date = d.metadata.dated ? d.metadata.signature_date : null;
  }
}
