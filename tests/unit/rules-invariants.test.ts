import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { evaluateDeal, selectPack } from "@/lib/rules/engine";
import { loadPack } from "@/lib/rules/loader";
import { readFixture, applyCase, fixtureInput, type Case } from "./engine-fixtures";
const cases: Case[] = [readFixture("clean"), ...["defects", "unknowns", "traps", "packs"].flatMap(name => readFixture(name))];
const key = (r: { item_id: string; scope_key: string; period: string | null }) => JSON.stringify([r.item_id,r.scope_key,r.period]);
describe("engine invariants across every authored scenario", () => {
 it("removing any segment or accepted fact never creates a satisfied row", () => {
  let deletions = 0;
  for (const c of cases) {
   const {input,pack} = applyCase(c), before = evaluateDeal(input,pack);
   const previouslySatisfied = new Set(before.checklist.filter(r => r.status === "satisfied").map(key));
   for (const property of ["segments","accepted_facts","pending_facts"] as const) for (let i=0;i<input[property].length;i++) {
    const copy = structuredClone(input); copy[property].splice(i,1);
    const after = evaluateDeal(copy,pack);
    expect(after.checklist.filter(r => r.status === "satisfied").every(r => previouslySatisfied.has(key(r))), c.name).toBe(true);
    // A fixed inventory deletion must also prevent a previously satisfied check from staying satisfied.
    expect(after.checklist.some(r => r.status === "satisfied"), c.name).toBe(false);
    deletions++;
   }
  }
  expect(deletions).toBeGreaterThan(4000);
 }, 60000);
 it("pending facts never supply accepted evidence", () => {
  const input = fixtureInput(), pack = loadPack("sop-50-10-8");
  for(const fact of input.accepted_facts.filter(f => JSON.stringify([...pack.items,...pack.consistency]).includes(f.attribute))) {
   const pending = structuredClone(input); pending.accepted_facts = pending.accepted_facts.filter(f => f.id !== fact.id); pending.pending_facts.push(fact);
   const result = evaluateDeal(pending,pack);
   expect(result.checklist.some(r => r.status === "needs_review") || result.findings.some(f => f.type === "needs_review")).toBe(true);
  }
 });
 it("repeated and shuffled inputs have identical hashes", () => {
  for (const c of cases) {
   const {input,pack} = applyCase(c), first = evaluateDeal(input,pack);
   const shuffled = structuredClone(input);
   for(const name of ["segments","accepted_facts","pending_facts","parties","ownership","tracking","manual_confirmations","waivers"] as const) shuffled[name].reverse();
   if(Array.isArray(shuffled.profile.equity_sources)) shuffled.profile.equity_sources.reverse();
   if(Array.isArray(shuffled.profile.paid_agents)) shuffled.profile.paid_agents.reverse();
   expect(evaluateDeal(input,pack).result_hash,c.name).toBe(first.result_hash);
   expect(evaluateDeal(shuffled,pack).result_hash,c.name).toBe(first.result_hash);
  }
 });
 it("engine has no system clock, database, randomness or I/O", () => {
  for(const file of ["engine","expressions","input"]) {
   const code=fs.readFileSync(`src/lib/rules/${file}.ts`,"utf8");
   expect(code).not.toMatch(/Date\.now|new Date\(\)|Math\.random|randomUUID|node:fs|node:net|fetch\(|getDb\(|process\.env/);
  }
 });
 it("pack selection and inclusive 14-day boundaries use the declared date", () => {
  const packs=[loadPack("sop-50-10-8"),loadPack("sop-50-10-8-1")];
  expect(selectPack("2026-09-30",packs).pack?.version).toBe("sop-50-10-8");
  expect(selectPack("2026-10-01",packs).pack?.version).toBe("sop-50-10-8-1");
  for(const date of ["2026-09-17","2026-10-15"]) expect(selectPack(date,packs).boundary).toBe(true);
  for(const date of ["2026-09-16","2026-10-16"]) expect(selectPack(date,packs).boundary).toBe(false);
  expect(selectPack("unknown",packs).pack).toBeNull();
  const input=fixtureInput();input.profile.expected_loan_number_date="2026-09-17";
  expect(evaluateDeal(input,packs[0]!).findings.some(f=>f.rule_id==="PACK-01"&&f.type==="info")).toBe(true);
 });
});
