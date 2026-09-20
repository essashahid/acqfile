import fs from "node:fs";
import path from "node:path";
import { FACTS } from "@/lib/domain/registry";
import { EngineInputSchema, type EngineInput } from "@/lib/rules/input";
import { loadPack } from "@/lib/rules/loader";
import type { ChecklistRow } from "@/lib/rules/engine";
export type ExpectedGroup = { ids: string[]; scope: string; periods?: string[]; status: string };
export type Case = {
  name: string;
  rules?: string[];
  pack?: string;
  overlay?: string;
  changes?: Change[];
  expected: { checklist: ExpectedGroup[]; findings: string[] };
  check_type?: string;
};
export type Change = {
  op:
    | "fact"
    | "segment"
    | "profile"
    | "remove_segment"
    | "pending"
    | "tracking"
    | "confirmation"
    | "add_segment"
    | "add_fact"
    | "remove_confirmation";
  id?: string;
  key?: string;
  value?: unknown;
};
export const readFixture = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "tests/fixtures/engine", name + ".json"), "utf8"),
  );
export function fixtureInput(): EngineInput {
  const f = readFixture("clean");
  const segments = f.segments.map(
    (s: { id: string; type: string; party: string; period?: string; metadata?: object }) => ({
      id: s.id,
      document_version_id: s.id + "-v1",
      file: s.id + ".pdf",
      metadata_locator: {
        file: s.id + ".pdf",
        page: 1,
        source_block: s.id + "-page-1",
        quote: "Synthetic signed and dated document; supplied pages 1 and 2 of 2",
      },
      doc_type: s.type,
      party_id: s.party,
      period: s.period ?? null,
      page_start: 1,
      page_end: 2,
      form_revision: null,
      signed: true,
      dated: true,
      signature_date: "2026-08-31",
      document_date: "2026-08-31",
      expected_page_count: 2,
      account_last_four: null,
      classification_method: "manual",
      classification_confidence: 1,
      status: "confirmed",
      is_current: true,
      ...s.metadata,
    }),
  );
  const accepted = f.segments.flatMap(
    (s: { id: string; party: string; period?: string; facts?: Record<string, unknown> }) =>
      Object.entries(s.facts ?? {}).map(([attribute, value]) => ({
        id: s.id + ":" + attribute,
        segment_id: s.id,
        subject_party_id: s.party,
        attribute,
        value,
        normalized_value: value,
        unit: FACTS[attribute]!.unit,
        period: s.period ?? null,
        method: "manual",
        locator: {
          file: s.id + ".pdf",
          page: 1,
          source_block: s.id + "-page-1",
          quote: JSON.stringify(value),
        },
        confidence: 1,
        confidence_components: { deterministic_validation: 1 },
        validators_passed: true,
        actor: "synthetic-reviewer",
        audit_event_id: s.id + ":" + attribute + ":audit",
        record_version: 1,
        is_current: true,
      })),
  );
  return EngineInputSchema.parse({
    profile: f.profile,
    parties: f.parties,
    ownership: f.ownership,
    segments,
    accepted_facts: accepted,
    pending_facts: [],
    tracking: f.tracking.map((rule_id: string) => ({
      rule_id,
      scope_key: "deal",
      state: "received",
      actor: "synthetic-reviewer",
      note: "Lender receipt recorded",
    })),
    manual_confirmations: f.confirmations.map(
      (c: { rule: string; scope: string; key: string }) => ({
        rule_id: c.rule,
        scope_key: c.scope,
        period: null,
        key: c.key,
        confirmed: true,
        actor: "synthetic-reviewer",
        note: "Synthetic lender discussion recorded",
        audit_event_id: c.rule + ":audit",
      }),
    ),
    waivers: [],
    as_of: f.as_of,
    evidence_inventory: {
      segment_ids: segments.map((s: { id: string }) => s.id),
      fact_ids: accepted.map((f: { id: string }) => f.id),
    },
  });
}
export function applyCase(c: Case) {
  const input = fixtureInput();
  for (const change of c.changes ?? []) {
    if (change.op === "profile") {
      const parts = change.key!.split(".");
      let obj: Record<string, unknown> = input.profile;
      for (const k of parts.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
      obj[parts.at(-1)!] = change.value;
    }
    if (change.op === "fact") {
      const fact = input.accepted_facts.find((f) => f.id === change.id);
      if (!fact) throw new Error(`Unknown fixture fact ${change.id}`);
      fact.value = fact.normalized_value = change.value;
      fact.locator.quote = JSON.stringify(change.value);
    }
    if (change.op === "segment")
      Object.assign(input.segments.find((s) => s.id === change.id)!, {
        [change.key!]: change.value,
      });
    if (change.op === "remove_segment") {
      input.segments = input.segments.filter((s) => s.id !== change.id);
      input.accepted_facts = input.accepted_facts.filter((f) => f.segment_id !== change.id);
    }
    if (change.op === "pending") {
      const f = input.accepted_facts.find((f) => f.id === change.id)!;
      input.accepted_facts = input.accepted_facts.filter((f) => f.id !== change.id);
      input.pending_facts.push(f);
    }
    if (change.op === "remove_confirmation")
      input.manual_confirmations = input.manual_confirmations.filter(
        (t) => t.rule_id !== change.id,
      );
    if (change.op === "tracking")
      input.tracking.find((t) => t.rule_id === change.id)!.state = change.value as "ordered";
    if (change.op === "confirmation")
      input.manual_confirmations.find((t) => t.rule_id === change.id)!.confirmed =
        change.value as boolean;
    if (change.op === "add_fact") {
      const segment = input.segments.find((s) => s.id === change.id)!;
      input.accepted_facts.push({
        ...input.accepted_facts[0]!,
        id: change.id + ":" + change.key,
        segment_id: segment.id,
        subject_party_id: segment.party_id,
        period: segment.period,
        attribute: change.key!,
        value: change.value,
        normalized_value: change.value,
        unit: FACTS[change.key!]!.unit,
        locator: {
          file: segment.file,
          page: 1,
          source_block: segment.id + "-page-1",
          quote: JSON.stringify(change.value),
        },
      });
    }
    if (change.op === "add_segment") {
      const s = { ...input.segments[0]!, ...(change.value as object) };
      s.document_version_id = s.id + "-v1";
      s.file = s.id + ".pdf";
      input.segments.push(s);
    }
  }
  input.evidence_inventory = {
    segment_ids: input.segments.map((s) => s.id),
    fact_ids: [...input.accepted_facts, ...input.pending_facts].map((f) => f.id),
  };
  const pack = loadPack(c.pack ?? "sop-50-10-8", c.overlay);
  if (c.rules) {
    pack.items = pack.items.filter((r) => c.rules!.includes(r.id));
    pack.consistency = pack.consistency.filter((r) => c.rules!.includes(r.id));
  }
  return { input, pack };
}
export function expectedRows(groups: ExpectedGroup[]) {
  return groups
    .flatMap((g) =>
      g.ids.flatMap((item_id) =>
        (g.periods ?? [null]).map((period) => ({
          item_id,
          scope_key: g.scope,
          period,
          status: g.status,
        })),
      ),
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function actualRows(rows: ChecklistRow[]) {
  return rows
    .map(({ item_id, scope_key, period, status }) => ({ item_id, scope_key, period, status }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
