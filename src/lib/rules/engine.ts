import { hashObject, stableStringify } from "@/lib/hash";
import { FACTS } from "@/lib/domain/registry";
import type { Fact, Segment } from "@/lib/domain/evidence";
import type { Party } from "@/lib/domain/profile";
import { EngineInputSchema, type EngineInput } from "./input";
import type { Check, Expr, ResolvedPack, Rule } from "./schema";
import { UNKNOWN, allTruth, daysBetween, equal, evaluateExpression, truth, type Truth } from "./expressions";
export type ChecklistStatus = "satisfied" | "received_with_issues" | "missing" | "needs_review" | "not_applicable" | "waived" | "tracking";
type Scope = { key: string; party: Party | null; source?: Record<string, unknown>; uncertain: boolean };
export type CheckResult = { type: Check["type"]; result: Truth; message: string };
export type ChecklistRow = { item_id: string; scope_key: string; period: string | null; status: ChecklistStatus; segment_ids: string[]; reasons: CheckResult[] };
export type Finding = { finding_key: string; rule_id: string; scope_key: string; period: string | null; type: string; severity: string; responsible: string; message: string; details: { fact_id: string | null; value: unknown; file: string; page: number | null; quote: string }[] };
export function selectPack(expected: string, packs: ResolvedPack[]) {
  const sorted = [...packs].sort((a, b) => a.effective.loan_number_on_or_after.localeCompare(b.effective.loan_number_on_or_after));
  if (expected === "unknown") return { pack: null, boundary: false };
  const pack = sorted.filter(p => p.effective.loan_number_on_or_after <= expected && (!p.effective.loan_number_before || expected < p.effective.loan_number_before)).at(-1) ?? null;
  return { pack, boundary: sorted.some(p => [p.effective.loan_number_on_or_after, p.effective.loan_number_before].some(d => d && Math.abs(daysBetween(expected, d)) <= 14)) };
}
function periods(rule: Rule, asOf: string): (string | null)[] {
  const year = Number(asOf.slice(0, 4)), month = Number(asOf.slice(5, 7));
  if (rule.period_requirement === "last_two_months") return [1, 2].map(offset => new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7)).sort();
  return rule.period_requirement ? [year - 3, year - 2, year - 1].map(String) : [null];
}
function scopeExpansion(rule: Rule, input: EngineInput): Scope[] {
  const partyById = new Map(input.parties.map(p => [p.id, p]));
  const buyers = input.parties.filter(p => p.roles.includes("buyer_entity")).sort((a,b) => a.id.localeCompare(b.id));
  const buyer = buyers[0];
  const links = input.ownership.filter(l => l.stage === "post_closing").sort((a,b) => stableStringify(a).localeCompare(stableStringify(b)));
  let uncertain = buyers.length !== 1;
  const weights = new Map<string, number>();
  function ancestors(id: string, weight: number, visited: Set<string>) {
    if (visited.has(id)) { uncertain = true; return; }
    const next = new Set([...visited, id]);
    for (const link of links.filter(l => l.owned_party_id === id)) {
      if (link.percent === "unknown" || !partyById.has(link.owner_party_id)) { uncertain = true; continue; }
      const effective = weight * link.percent / 100;
      if (effective > 0) { weights.set(link.owner_party_id, (weights.get(link.owner_party_id) ?? 0) + effective); ancestors(link.owner_party_id, effective, next); }
    }
  }
  if (buyer) ancestors(buyer.id, 100, new Set());
  const guarantors = input.parties.filter(p => p.roles.includes("guarantor") || p.kind === "individual" && (weights.get(p.id) ?? 0) >= 20);
  let parties: Party[] = [];
  switch (rule.scope) {
    case "deal": return [{ key: "deal", party: null, uncertain: false }];
    case "buyer_entity": parties = input.parties.filter(p => p.roles.includes("buyer_entity")); break;
    case "target_business": parties = input.parties.filter(p => p.roles.includes("seller_entity")); break;
    case "per_guarantor": parties = guarantors; break;
    case "per_owner_or_guarantor": parties = input.parties.filter(p => weights.has(p.id) || p.roles.includes("buyer_owner") || guarantors.some(g => g.id === p.id)); break;
    case "per_affiliate": {
      const ids = new Set<string>();
      for (const g of guarantors) {
        if (g.affiliates === "unknown") uncertain = true; else g.affiliates.forEach(id => ids.add(id));
        for (const l of links.filter(l => l.owner_party_id === g.id && l.owned_party_id !== buyer?.id)) {
          if (l.percent === "unknown") uncertain = true; else if (l.percent >= 20) ids.add(l.owned_party_id);
        }
      }
      parties = input.parties.filter(p => ids.has(p.id));
      if ([...ids].some(id => !partyById.has(id))) uncertain = true;
      break;
    }
    case "per_equity_source": case "per_paid_agent": {
      const list = rule.scope === "per_equity_source" ? input.profile.equity_sources : input.profile.paid_agents;
      if (list === "unknown") return [{ key: "unknown", party: null, uncertain: true }];
      return list.map(source => ({ key: source.id, source, party: partyById.get(source.party) ?? null, uncertain: !partyById.has(source.party) }));
    }
  }
  const result = parties.map(party => ({ key: party.id, party, uncertain }));
  if (!result.length && (uncertain || ["buyer_entity", "target_business", "per_guarantor", "per_owner_or_guarantor"].includes(rule.scope))) result.push({ key: "unknown", party: null as unknown as Party, uncertain: true });
  return result;
}
function profileValue(path: string, input: EngineInput, scope: Scope, kinds?: string[]): unknown {
  if (path.includes("[]")) {
    const [listName, field = ""] = path.split("[].");
    const list = input.profile[listName as "equity_sources" | "paid_agents"];
    if (list === "unknown") return UNKNOWN;
    if (scope.source && !kinds) return scope.source[field] === "unknown" ? UNKNOWN : scope.source[field];
    if (kinds && list.some(s => "kind" in s && s.kind === "unknown")) return UNKNOWN;
    const values = list.filter(s => !kinds || "kind" in s && kinds.includes(s.kind)).map(s => (s as Record<string, unknown>)[field]);
    return values.some(v => v === "unknown") ? UNKNOWN : values;
  }
  let value: unknown = input.profile;
  for (const key of path.split(".")) { if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return UNKNOWN; value = (value as Record<string, unknown>)[key]; }
  return value === "unknown" ? UNKNOWN : value;
}
export function evaluateDeal(raw: EngineInput, pack: ResolvedPack, availablePacks: ResolvedPack[] = [pack]) {
  const input = EngineInputSchema.parse(raw);
  const segments = input.segments.filter(s => s.is_current && s.status === "confirmed").sort((a, b) => a.id.localeCompare(b.id));
  const segmentById = new Map(segments.map(s => [s.id, s]));
  const inventoryMissing = input.evidence_inventory.segment_ids.some(id => !input.segments.some(s => s.id === id)) || input.evidence_inventory.fact_ids.some(id => ![...input.accepted_facts, ...input.pending_facts].some(f => f.id === id));
  const validFact = (f: Fact) => f.is_current && !!segmentById.get(f.segment_id) && FACTS[f.attribute]!.producers.includes(segmentById.get(f.segment_id)!.doc_type) && f.validators_passed;
  const facts = input.accepted_facts.filter(validFact).sort((a, b) => a.id.localeCompare(b.id));
  const pending = [...input.pending_facts.filter(f => f.is_current), ...input.accepted_facts.filter(f => f.is_current && !validFact(f) && segmentById.has(f.segment_id))];
  const checklist: ChecklistRow[] = [], findings: Finding[] = [];
  const pushFinding = (r: Rule, scope: Scope, period: string | null, type: string, message: string, used: Set<string>, severity = r.severity) => {
    const details: Finding["details"] = [...facts, ...pending].filter(f => used.has(f.id)).map(f => ({ fact_id: f.id, value: f.normalized_value, file: f.locator.file, page: f.locator.page, quote: f.locator.quote }));
    for (const segment of segments.filter(s => (r.checks.some(c => c.mode === "party_assignment") ? !s.party_id || !input.parties.some(p => p.id === s.party_id) : r.accepts.includes(s.doc_type) && (!scope.party || s.party_id === scope.party.id) && (!period || s.period === period)))) {
      details.push({ fact_id: null, value: { signed: segment.signed, dated: segment.dated, signature_date: segment.signature_date, period: segment.period, party_id: segment.party_id }, file: segment.file, page: segment.page_start, quote: segment.metadata_locator.quote });
    }
    details.push({ fact_id: null, value: { ...input.profile, equity_sources: Array.isArray(input.profile.equity_sources) ? [...input.profile.equity_sources].sort((a,b) => a.id.localeCompare(b.id)) : input.profile.equity_sources, paid_agents: Array.isArray(input.profile.paid_agents) ? [...input.profile.paid_agents].sort((a,b) => a.id.localeCompare(b.id)) : input.profile.paid_agents }, file: "Declared deal profile", page: null, quote: "Operator-declared profile; rule parameters: " + stableStringify(pack.parameters) });
    findings.push({ finding_key: hashObject([r.id, scope.key, period]), rule_id: r.id, scope_key: scope.key, period, type, severity, responsible: r.responsible, message, details: details.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))) });
  };
  for (const [isConsistency, rules] of [[false, pack.items], [true, pack.consistency]] as const) for (const rule of rules) {
    const expanded = scopeExpansion(rule, input);
    if (!expanded.length && !isConsistency) checklist.push({ item_id: rule.id, scope_key: "none", period: null, status: "not_applicable", segment_ids: [], reasons: [] });
    for (const scope of expanded) for (const period of periods(rule, input.as_of)) {
      const used = new Set<string>();
      const matching = (s: Segment, types: readonly string[] = rule.accepts) => types.includes(s.doc_type) && (!scope.party || s.party_id === scope.party.id) && (period === null || s.period === period) && (!scope.source || !scope.source.source_account_last_four || scope.source.source_account_last_four === "unknown" || s.doc_type !== "BANK_STATEMENT" || s.account_last_four === scope.source.source_account_last_four);
      const evidence = segments.filter(s => matching(s));
      const resolveFact = (ref: Extract<Expr, { fact: string }>): unknown => {
        const types = ref.types ?? rule.accepts;
        const match = (f: Fact) => f.attribute === ref.fact && (!scope.party || f.subject_party_id === scope.party.id) && (period === null || f.period === period) && (() => { const s = segmentById.get(f.segment_id); return s && matching(s, types); })();
        const awaiting = pending.filter(match); awaiting.forEach(f => used.add(f.id));
        let selected = facts.filter(match); selected.forEach(f => used.add(f.id));
        if (!selected.length) return UNKNOWN;
        if (awaiting.length && ref.select !== "list") return UNKNOWN;
        if (ref.within_days !== undefined) {
          const relative = ref.relative_to ? resolveFact({ fact: ref.relative_to, types: FACTS[ref.relative_to]!.producers }) : input.as_of;
          if (typeof relative !== "string") return UNKNOWN;
          selected = selected.filter(f => { const s = segmentById.get(f.segment_id)!; const date = s.document_date; return date && Math.abs(daysBetween(date, relative)) <= ref.within_days!; });
          // One most recent statement per account; old monthly statements are not added twice.
          const grouped = new Map<string, Fact>();
          for (const f of selected) { const s = segmentById.get(f.segment_id)!; if (!s.account_last_four) return UNKNOWN; const old = grouped.get(s.account_last_four); if (!old || (segmentById.get(old.segment_id)!.document_date ?? "") < (s.document_date ?? "")) grouped.set(s.account_last_four, f); }
          selected = [...grouped.values()];
        }
        if (ref.select === "latest") {
          const latest = selected.map(f => segmentById.get(f.segment_id)?.document_date ?? "").sort().at(-1);
          if (!latest) return UNKNOWN;
          selected = selected.filter(f => segmentById.get(f.segment_id)?.document_date === latest);
        }
        if (!selected.length) return UNKNOWN;
        let values = selected.map(f => f.normalized_value);
        if (ref.field) values = values.flatMap(v => Array.isArray(v) ? v.map(row => row[ref.field!]) : [UNKNOWN]);
        if (ref.select === "sum") return values.every(v => typeof v === "number") ? values.reduce<number>((a, v) => a + (v as number), 0) : UNKNOWN;
        if (ref.select === "list" || ref.field) return [...values, ...(awaiting.length ? [UNKNOWN] : [])];
        return values.every(v => equal(v, values[0])) ? values[0] : UNKNOWN;
      };
      const resolve = (ref: Parameters<typeof evaluateExpression>[1] extends (a: infer R) => unknown ? R : never): unknown => {
        if ("fact" in ref) return resolveFact(ref);
        if ("profile" in ref) return profileValue(ref.profile, input, scope, ref.kinds);
        if ("param" in ref) return pack.parameters[ref.param] ?? UNKNOWN;
        return input.as_of;
      };
      const expression = (e: Expr, tolerance = 0) => truth(evaluateExpression(e, resolve, tolerance));
      const applies = scope.uncertain ? "unknown" : expression(rule.applies_when);
      const row: ChecklistRow = { item_id: rule.id, scope_key: scope.key, period, status: "not_applicable", segment_ids: [], reasons: [] };
      if (!rule.required || applies === "fail") { if (!isConsistency) checklist.push(row); continue; }
      const waiver = input.waivers.find(w => w.rule_id === rule.id && w.scope_key === scope.key && w.period === period);
      if (waiver && applies === "pass" && !inventoryMissing) { row.status = "waived"; if (!isConsistency) checklist.push(row); continue; }
      function agreement(c: Check): Truth {
        if (c.mode === "party_assignment") return segments.every(s => s.party_id && input.parties.some(p => p.id === s.party_id)) ? "pass" : "fail";
        if (c.mode === "buyer_seller") {
          return allTruth(([['deal.buyer','buyer_entity'],['deal.seller','seller_entity']] as const).map(([attribute, role]) => {
            const parties = input.parties.filter(p => p.roles.includes(role)); const party = parties.length === 1 ? parties[0] : undefined; const value = resolveFact({ fact: attribute, select: "list" });
            return !party || value === UNKNOWN || party.legal_name === "unknown" ? "unknown" : allTruth((value as unknown[]).map(v => v === UNKNOWN ? "unknown" : equal(v, party.legal_name) ? "pass" : "fail"));
          }));
        }
        if (c.mode === "party_name" || c.mode === "account_holder") {
          const value = resolveFact({ fact: c.fact!, select: "list" });
          if (!scope.party || scope.party.legal_name === "unknown" || value === UNKNOWN || scope.source?.source_account_last_four === "unknown") return "unknown";
          if (scope.source?.kind === "gift" && !scope.party.roles.includes("donor")) return "fail";
          return allTruth((value as unknown[]).map(v => v === UNKNOWN ? "unknown" : equal(v, scope.party!.legal_name) ? "pass" : "fail"));
        }
        const types = c.across ?? rule.accepts;
        const values: unknown[] = types.flatMap(t => { const value = resolveFact({ fact: c.fact!, types: [t], select: "list" }); return value === UNKNOWN ? [UNKNOWN] : value as unknown[]; });
        if (c.profile) values.push(profileValue(c.profile, input, scope));
        if (c.mode === "owners") {
          const links = input.ownership.filter(l => l.stage === "post_closing" && l.owned_party_id === scope.party?.id);
          const declared = links.map(l => ({ name: input.parties.find(p => p.id === l.owner_party_id)?.legal_name ?? "unknown", percent: l.percent }));
          if (!links.length || declared.some(d => d.name === "unknown" || d.percent === "unknown")) values.push(UNKNOWN); else values.push(declared);
          const known = values.filter(v => v !== UNKNOWN);
          if (known.some(v => !Array.isArray(v) || Math.abs(v.reduce((sum: number, r: { percent: number }) => sum + r.percent, 0) - 100) > Number(pack.parameters.percent_tolerance))) return "fail";
          const normalized = known.map(v => (v as {name:string;percent:number}[]).map(o => ({name:o.name,percent:o.percent})));
          if (!normalized.every(v => equal(v, normalized[0]))) return "fail";
          return values.some(v => v === UNKNOWN) ? "unknown" : "pass";
        }
        const known = values.filter(v => v !== UNKNOWN);
        if (!known.every(v => equal(v, known[0], Number(pack.parameters[c.tolerance_param ?? ""] ?? 0)))) return "fail";
        return values.some(v => v === UNKNOWN) ? "unknown" : "pass";
      }
      function runCheck(c: Check): Truth {
        if (c.when) { const condition = expression(c.when); if (condition !== "pass") return condition === "unknown" ? "unknown" : "pass"; }
        switch (c.type) {
          case "presence": {
            if (!evidence.length) return "fail";
            if (c.facts?.some(f => f.startsWith("financial.")) && new Set(evidence.map(s => s.period ?? s.document_date)).size !== 1) return "unknown";
            return allTruth((c.facts ?? []).map(f => resolveFact({ fact: f }) === UNKNOWN ? "unknown" : "pass"));
          }
          case "period_coverage": return evidence.length ? "pass" : "fail";
          case "freshness": {
            const resolved = c.metadata ? UNKNOWN : resolveFact({ fact: c.fact!, select: "list" });
            const dates = c.metadata ? evidence.map(s => s[c.metadata!]) : resolved === UNKNOWN ? [UNKNOWN] : resolved as unknown[];
            if (!dates.length) return "unknown";
            return allTruth(dates.map(d => { if (typeof d !== "string") return "unknown"; const age = daysBetween(d, input.as_of); return age >= 0 && age <= Number(pack.parameters[c.max_age_param!]) ? "pass" : "fail"; }));
          }
          case "signed_and_dated": return !evidence.length ? "unknown" : allTruth(evidence.map(s => s.signed === false || !c.signed_only && s.dated === false ? "fail" : s.signed === null || !c.signed_only && (s.dated === null || !s.signature_date) ? "unknown" : "pass"));
          case "page_completeness": return !evidence.length ? "unknown" : allTruth(evidence.map(s => s.expected_page_count === null ? "unknown" : s.page_end - s.page_start + 1 === s.expected_page_count ? "pass" : "fail"));
          case "form_revision": return !evidence.length ? "unknown" : allTruth(evidence.map(s => s.form_revision === null ? "unknown" : s.form_revision === pack.parameters[c.revision_param!] ? "pass" : "fail"));
          case "arithmetic": case "fact_comparison": case "date_order": return expression(c.expr!, Number(pack.parameters[c.tolerance_param ?? ""] ?? 0));
          case "fact_agreement": return agreement(c);
          case "manual_confirmation": { const confirmation = input.manual_confirmations.find(m => m.rule_id === rule.id && m.scope_key === scope.key && m.period === period && m.key === c.note_key); return confirmation ? confirmation.confirmed ? "pass" : "fail" : "unknown"; }
          case "tracking": { const t = input.tracking.find(t => t.rule_id === rule.id && t.scope_key === scope.key); return t?.state === "received" ? "pass" : t ? "fail" : "unknown"; }
        }
      }

      const extension = !evidence.length && period === String(Number(input.as_of.slice(0, 4)) - 1) && rule.period_requirement === "last_three_tax_years" && !isConsistency && segments.some(s => s.doc_type === "TAX_EXTENSION" && s.party_id === scope.party?.id && s.period === period);
      const waiting = input.segments.some(s => s.is_current && s.status === "proposed" && matching(s));
      const noEvidence = !isConsistency && rule.accepts.length > 0 && !evidence.length && !rule.checks.some(c => c.type === "tracking");
      if (applies === "unknown" || inventoryMissing) {
        row.status = "needs_review"; pushFinding(rule, scope, period, "needs_review", "Evidence or applicability needs review: " + rule.title, used);
        if (!isConsistency) checklist.push(row); continue;
      }
      if (noEvidence && !extension) {
        row.status = waiting ? "needs_review" : "missing";
        pushFinding(rule, scope, period, row.status, waiting ? "Proposed evidence awaits confirmation: " + rule.title : "Missing: " + rule.title, used);
        checklist.push(row); continue;
      }
      row.reasons = rule.checks.map(c => ({ type: c.type, result: runCheck(c), message: c.message }));
      const issues = row.reasons.filter(r => r.result !== "pass").map(r => `${r.result}: ${r.message}`).join("; ");
      const result = allTruth(row.reasons.map(r => r.result));
      if (extension && applies === "pass" && !inventoryMissing) { row.status = "received_with_issues"; pushFinding(rule, scope, period, "info", "latest year on extension", used, "info"); }
      else if (result === "unknown") { row.status = "needs_review"; pushFinding(rule, scope, period, "needs_review", issues || "Evidence needs review: " + rule.title, used); }
      else if (result === "pass") { row.status = "satisfied"; row.segment_ids = evidence.map(s => s.id).sort(); }
      else {
        row.status = rule.checks.some(c => c.type === "tracking") ? "tracking" : !evidence.length && rule.accepts.length ? "missing" : "received_with_issues";
        const type = rule.finding_type ?? (row.status === "missing" ? "missing" : row.reasons.some(r => r.type === "freshness" && r.result === "fail") ? "stale" : "incomplete");
        pushFinding(rule, scope, period, type, issues, used);
      }
      if (!isConsistency) checklist.push(row);
    }
  }
  const selected = selectPack(input.profile.expected_loan_number_date, availablePacks);
  if (!selected.pack || selected.pack.version !== pack.version || selected.boundary) {
    const unknown = !selected.pack || selected.pack.version !== pack.version;
    findings.push({ finding_key: hashObject(["PACK-01", "deal", null]), rule_id: "PACK-01", scope_key: "deal", period: null, type: unknown ? "needs_review" : "info", severity: unknown ? "major" : "info", responsible: "lender", message: "Confirm the applicable SOP version with the lender", details: [{ fact_id: null, value: input.profile.expected_loan_number_date, file: "Declared deal profile", page: null, quote: "Expected SBA loan number date" }] });
  }
  checklist.sort((a, b) => stableStringify([a.item_id, a.scope_key, a.period]).localeCompare(stableStringify([b.item_id, b.scope_key, b.period])));
  findings.sort((a, b) => a.finding_key.localeCompare(b.finding_key));
  const result = { pack_hash: pack.content_hash, as_of: input.as_of, checklist, findings };
  return { ...result, result_hash: hashObject(result) };
}
