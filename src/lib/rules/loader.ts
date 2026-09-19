import fs from "node:fs";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import { hashObject, stableStringify } from "@/lib/hash";
import { FACTS } from "@/lib/domain/registry";
import { PackSchema, OverlaySchema, type Pack, type Overlay, type ResolvedPack, type Expr, type Rule } from "./schema";
export const PACK_VERSIONS = ["sop-50-10-8", "sop-50-10-8-1"] as const;
export const OVERLAY_IDS = ["northfield-bank"] as const;
export const BANNED_TERMS = /\b(eligible|ineligible|qualifies|approved|compliant)\b|meets SBA requirements/i;
export function parseYaml(text: string): unknown {
  if (text.length > 1000000) throw new Error("Pack exceeds size limit");
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join("; "));
  return doc.toJS({ maxAliasCount: 0 });
}
function expressions(rule: Rule): Expr[] { return [rule.applies_when, ...rule.checks.flatMap(c => [c.expr, c.when].filter((e): e is Expr => e !== undefined))]; }
export function validatePack(input: unknown): Pack {
  const pack = PackSchema.parse(input);
  const rules = [...pack.items, ...pack.consistency];
  if (new Set(rules.map(r => r.id)).size !== rules.length) throw new Error("Duplicate rule id");
  for (const r of rules) {
    if (BANNED_TERMS.test([r.title, r.description, ...r.checks.map(c => c.message)].join(" "))) throw new Error(`Banned term in ${r.id}`);
    if (!r.accepts.length && !r.checks.every(c => c.type === "tracking" || c.expr || c.mode === "party_assignment")) throw new Error(`${r.id}: evidence types required`);
    const parameter = (key: string) => { if (!Object.hasOwn(pack.parameters, key)) throw new Error(`${r.id}: unknown parameter ${key}`); };
    const walk = (e: Expr, depth = 0) => {
      if (depth > 24) throw new Error("Expression depth limit");
      if (!e || typeof e !== "object") return;
      if ("op" in e) e.args.forEach(a => walk(a, depth + 1));
      if ("param" in e) parameter(e.param);
      if ("fact" in e && e.types?.some(t => !(FACTS[e.fact]!.producers as readonly string[]).includes(t))) throw new Error(`${r.id}: invalid producer for ${e.fact}`);
    };
    expressions(r).forEach(e => walk(e));
    for (const c of r.checks) {
      for (const key of [c.max_age_param, c.revision_param, c.tolerance_param]) if (key) parameter(key);
      for (const fact of [...(c.facts ?? []), ...(c.fact ? [c.fact] : [])]) {
        const types = c.across ?? r.accepts;
        if (!types.some(t => FACTS[fact]!.producers.includes(t))) throw new Error(`${r.id}: no producer for ${fact}`);
        if (c.across?.some(t => !FACTS[fact]!.producers.includes(t))) throw new Error(`${r.id}: invalid agreement producer`);
      }
    }
  }
  if (!pack.index.filename_template.endsWith("{original_extension}")) throw new Error("Filename must preserve original extension");
  return pack;
}
export function resolvePack(input: unknown, overlayInput?: unknown): ResolvedPack {
  const pack = structuredClone(validatePack(input));
  let overlay: Overlay | undefined;
  if (overlayInput) {
    overlay = OverlaySchema.parse(overlayInput);
    for (const operation of overlay.operations) {
      if (operation.op === "add") {
        if ([...pack.items, ...pack.consistency].some(r => r.id === operation.rule.id)) throw new Error(`Overlay duplicate ${operation.rule.id}`);
        pack[operation.collection].push(operation.rule);
      } else {
        const collection = pack.items.some(r => r.id === operation.id) ? pack.items : pack.consistency;
        const index = collection.findIndex(r => r.id === operation.id);
        if (index < 0) throw new Error(`Overlay target missing: ${operation.id}`);
        if (operation.op === "remove") collection.splice(index, 1);
        else collection[index] = { ...collection[index]!, ...operation.changes };
      }
    }
    for (const key of Object.keys(overlay.parameters)) if (!Object.hasOwn(pack.parameters, key)) throw new Error(`Overlay parameter missing: ${key}`);
    pack.parameters = { ...pack.parameters, ...overlay.parameters };
    pack.index = { ...pack.index, ...overlay.index };
  }
  const validated = validatePack(pack);
  validated.items.sort((a, b) => a.id.localeCompare(b.id));
  validated.consistency.sort((a, b) => a.id.localeCompare(b.id));
  const content = { ...validated, overlay: overlay?.id ?? null };
  return { ...content, content_hash: hashObject(content) };
}
export function loadPack(version: string, overlay?: string): ResolvedPack {
  if (!(PACK_VERSIONS as readonly string[]).includes(version)) throw new Error("Unknown pack version");
  if (overlay && !(OVERLAY_IDS as readonly string[]).includes(overlay)) throw new Error("Unknown overlay");
  const root = path.join(process.cwd(), "rulepacks");
  return resolvePack(parseYaml(fs.readFileSync(path.join(root, "sba7a-cho", `${version}.yaml`), "utf8")), overlay ? parseYaml(fs.readFileSync(path.join(root, "overlays", `${overlay}.yaml`), "utf8")) : undefined);
}
export function canonicalPack(pack: ResolvedPack) { const { content_hash: _hash, ...content } = pack; void _hash; return stableStringify(content); }
export function resolvedYaml(pack: ResolvedPack) { return stringify(JSON.parse(canonicalPack(pack)), { lineWidth: 120 }); }
export function comparePacks(left: ResolvedPack, right: ResolvedPack) {
  const a = new Map([...left.items, ...left.consistency].map(r => [r.id, r]));
  const b = new Map([...right.items, ...right.consistency].map(r => [r.id, r]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap(id => {
    const l = a.get(id), r = b.get(id);
    // Parameters used by a rule are part of its effective behavior.
    const used = (rule: Rule | undefined, pack: ResolvedPack) => {
      if (!rule) return null;
      const json = JSON.stringify(rule);
      return { rule, parameters: Object.fromEntries(Object.entries(pack.parameters).filter(([k]) => json.includes(`"${k}"`))) };
    };
    const before = used(l, left), after = used(r, right);
    return stableStringify(before) === stableStringify(after) ? [] : [{ id, change: !l ? "added" : !r ? "removed" : "changed", before, after }];
  });
}
