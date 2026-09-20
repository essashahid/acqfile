import fs from "node:fs";
import * as XLSX from "xlsx";
import { describe, it, expect } from "vitest";
import { FactSchema, maskIdentifier, scrubIdentifiers } from "@/lib/domain/evidence";
import { DocumentTypeSchema, FactAttributeSchema, TAXONOMY, FACT_CATALOG } from "@/lib/domain/registry";
import { DealProfileSchema } from "@/lib/domain/profile";
import { CHECK_TYPES, ExprSchema, type Expr } from "@/lib/rules/schema";
import { UNKNOWN, evaluateExpression, addYears } from "@/lib/rules/expressions";
import { loadPack, resolvePack, parseYaml, canonicalPack, comparePacks, BANNED_TERMS } from "@/lib/rules/loader";
import { hashObject } from "@/lib/hash";
import { exportReview } from "@/lib/rules/review-export";
import { evaluateDeal } from "@/lib/rules/engine";
import { fixtureInput, readFixture, type Case } from "./engine-fixtures";
const base=()=>JSON.parse(canonicalPack(loadPack("sop-50-10-8")));
const raw=()=>{const b=base();delete b.overlay;return b;};
describe("rule validation, registries, overlays and review exports",()=>{
 it("validates 52 document types and the complete fact catalog",()=>{
  expect(TAXONOMY).toHaveLength(52);expect(FACT_CATALOG).toHaveLength(79);
  expect(DocumentTypeSchema.safeParse('NOT_A_TYPE').success).toBe(false);
  expect(FactAttributeSchema.safeParse('unregistered.value').success).toBe(false);
  expect(DealProfileSchema.safeParse({...fixtureInput().profile,structure:'made_up'}).success).toBe(false);
 });
 it("fails unknown operators, references, missing provenance, duplicates and banned wording",()=>{
  const mutations=[(p:ReturnType<typeof raw>)=>p.items[0].checks[0].expr={op:'eval',args:[]},(p:ReturnType<typeof raw>)=>p.items[0].applies_when={profile:'missing.path'},(p:ReturnType<typeof raw>)=>p.items[0].checks[0].facts=['missing.fact'],(p:ReturnType<typeof raw>)=>p.items[0].accepts=['FAKE'],(p:ReturnType<typeof raw>)=>delete p.items[0].verified,(p:ReturnType<typeof raw>)=>delete p.items[0].source_ref,(p:ReturnType<typeof raw>)=>p.items.push(p.items[0]),(p:ReturnType<typeof raw>)=>p.items[0].title='approved', (p:ReturnType<typeof raw>)=>p.items[0].checks[0].expr={param:'does_not_exist'}];
  for(const mutate of mutations){const p=raw();mutate(p);expect(()=>resolvePack(p)).toThrow();}
  expect(()=>parseYaml('id: a\nid: b')).toThrow();expect(()=>parseYaml('a: &a [1]\nb: *a')).toThrow();
 });
 it("merges add/remove/set by id without changing base data",()=>{
  const p=raw(),count=p.items.length;
  const overlay={id:'test-lender',verified:false,parameters:{interim_days:30},operations:[{op:'remove',id:'ENT-02'},{op:'set',id:'ENT-03',changes:{title:'Operating terms',severity:'minor'}},{op:'add',collection:'items',rule:{...p.items[0],id:'TEST-01'}}]};
  const result=resolvePack(p,overlay);expect(result.items).toHaveLength(count);expect(p.items.some((r:{id:string})=>r.id==='ENT-02')).toBe(true);
  expect(result.items.find(r=>r.id==='ENT-03')?.title).toBe('Operating terms');
  expect(()=>resolvePack(p,{...overlay,operations:[{op:'remove',id:'NO-01'}]})).toThrow();
  expect(()=>resolvePack(p,{...overlay,operations:[{op:'add',collection:'items',rule:p.items[0]}]})).toThrow();
  expect(hashObject(JSON.parse(canonicalPack(result)))).toBe(result.content_hash);
 });
 it("Sample Lender A has two required additions, five optional definitions and a changed template",()=>{
  const before=loadPack('sop-50-10-8'),after=loadPack('sop-50-10-8','sample-lender-a');
  expect(after.items.filter(r=>r.required).length-before.items.filter(r=>r.required).length).toBe(2);
  expect(after.items.filter(r=>!r.required).map(r=>r.id)).toEqual(['TGT-12a','TGT-12b','TGT-12c','TXN-10b','TXN-10c']);
  expect(after.parameters.interim_days).toBe(60);expect(after.index.filename_template).not.toBe(before.index.filename_template);
  expect(comparePacks(before,after).some(d=>d.id==='TGT-03'&&d.change==='changed')).toBe(true);
 });
 it("exports all resolved rules with an empty SME column and exact footer; XLSX text never formulas",()=>{
  const pack=loadPack('sop-50-10-8');pack.items[0]!.title='=HYPERLINK("https://example.com")';
  const out=exportReview([pack]);const book=XLSX.read(out.xlsx,{type:'buffer'}),sheet=book.Sheets[book.SheetNames[0]!]!;
  const rows=XLSX.utils.sheet_to_json<string[]>(sheet,{header:1});expect(rows[0]).toContain('SME correction');
  expect(rows.length).toBe(pack.items.length+pack.consistency.length+3);
  expect(sheet.D2?.t).toBe('s');expect(sheet.D2?.f).toBeUndefined();expect(rows[1]?.at(-1)).toBe('');
  expect(out.html).toContain('Rules marked unverified have not been confirmed by a lender.');expect(out.html).not.toMatch(BANNED_TERMS);
 });
 it("the defect fixtures cover every check and every CON rule",()=>{
  const cases=readFixture('defects') as Case[];
  expect(new Set(cases.map(c=>c.check_type).filter(Boolean))).toEqual(new Set(CHECK_TYPES));
  expect(cases.flatMap(c=>c.rules??[]).filter(id=>id.startsWith('CON-')).sort()).toEqual(Array.from({length:16},(_,i)=>`CON-${String(i+1).padStart(2,'0')}`));
 });
});
describe("safe expressions and manual evidence",()=>{
 it("implements allowed operations with three-valued Boolean logic and date arithmetic",()=>{
  const evaluate=(op:string,...args:Expr[])=>evaluateExpression(ExprSchema.parse({op,args}),()=>UNKNOWN);
  expect(evaluate('and',false,{fact:'pfs.cash'})).toBe(false);expect(evaluate('or',true,{profile:'structure'})).toBe(true);
  expect(evaluate('/',1,0)).toBe(UNKNOWN);expect(evaluate('not',false)).toBe(true);expect(evaluate('!=',1,2)).toBe(true);
  for(const [op,a,b,expected] of [['+',2,3,5],['-',5,2,3],['*',2,3,6],['/',6,2,3],['<',2,3,true],['<=',3,3,true],['>',3,2,true],['>=',3,3,true],['==',3,3,true]] as const)expect(evaluate(op,a,b)).toBe(expected);
  expect(evaluate('in','asset',['asset','stock'])).toBe(true);expect(evaluate('exists','value')).toBe(true);expect(evaluate('abs',-3)).toBe(3);
  for(const [op,expected] of [['sum',6],['min',1],['max',3]] as const) expect(evaluateExpression({op,args:[{param:'values'}]},()=>[1,2,3])).toBe(expected);
  expect(evaluate('days_between','2026-01-01','2026-01-03')).toBe(2);expect(evaluate('add_days','2026-01-31',1)).toBe('2026-02-01');expect(addYears('2024-02-29',1)).toBe('2025-02-28');
 });
 it("requires manual actor, evidence, validators and event even at confidence 1",()=>{
  const f=fixtureInput().accepted_facts[0]!;
  for(const change of [{actor:null},{audit_event_id:null},{validators_passed:false},{locator:{}}])expect(FactSchema.safeParse({...f,...change}).success).toBe(false);
 });
 it("stores HMAC plus last four only and masks pattern identifiers",()=>{
  const key='synthetic-only-key-of-at-least-32-bytes';const a=maskIdentifier('123-45-6789',key),b=maskIdentifier('123456789',key);expect(a).toEqual(b);
  expect(JSON.stringify(a)).not.toContain('123456789');expect(a.last_four).toBe('6789');expect(maskIdentifier('123456789',key+'2').hmac).not.toBe(a.hmac);
  expect(scrubIdentifiers('SSN 123-45-6789 EIN 12-3456789 account 123456789012')).not.toMatch(/123-45|12-345|123456789012/);
  const f=fixtureInput().accepted_facts.find(f=>f.attribute==='party.identifier')!;expect(FactSchema.safeParse({...f,value:{...a,clear:'123456789'}}).success).toBe(false);
 });
 it("latest-year extension is an info exception, older extensions cannot fill a return",()=>{
  const input=fixtureInput();for(const year of ['2024','2025']){const seg=input.segments.find(s=>s.id==='personal-'+year)!;seg.doc_type='TAX_EXTENSION';}
  const result=evaluateDeal(input,loadPack('sop-50-10-8'));
  expect(result.checklist.find(r=>r.item_id==='GUA-02'&&r.period==='2025')?.status).toBe('received_with_issues');
  expect(result.findings.find(f=>f.rule_id==='GUA-02'&&f.period==='2025')).toMatchObject({type:'info',message:'latest year on extension'});
  expect(result.checklist.find(r=>r.item_id==='GUA-02'&&r.period==='2024')?.status).toBe('missing');
 });
 it("a documented waiver is explicit and does not change findings into a receipt",()=>{
  const input=fixtureInput();input.waivers.push({rule_id:'ENT-02',scope_key:'buyer',period:null,actor:'reviewer',note:'Lender waived',audit_event_id:'waiver-event'});
  expect(evaluateDeal(input,loadPack('sop-50-10-8')).checklist.find(r=>r.item_id==='ENT-02')?.status).toBe('waived');
 });
 it("production definitions do not execute strings",()=>{for(const file of ['engine','expressions','loader'])expect(fs.readFileSync(`src/lib/rules/${file}.ts`,'utf8')).not.toMatch(/\beval\s*\(|new Function\s*\(/);});
});

describe('scope and evidence edge cases',()=>{
 it('expands indirect owners and implicit guarantors without duplicate rows',()=>{
  const input=fixtureInput();
  input.parties.push({...input.parties[2]!,id:'holding',kind:'entity',roles:['buyer_owner'],legal_name:'Zelmivar Holdings LLC'});
  input.ownership=[{owner_party_id:'holding',owned_party_id:'buyer',percent:100,stage:'post_closing',origin:'declared'},{owner_party_id:'alex',owned_party_id:'holding',percent:100,stage:'post_closing',origin:'declared'}];
  input.parties.find(p=>p.id==='alex')!.roles=['buyer_owner'];
  const rows=evaluateDeal(input,loadPack('sop-50-10-8')).checklist;
  expect(rows.filter(r=>r.item_id==='GUA-05').map(r=>r.scope_key).sort()).toEqual(['alex','holding']);
  expect(rows.filter(r=>r.item_id==='GUA-01').map(r=>r.scope_key).sort()).toEqual(['alex']);
 });
 it('expands affiliates and paid agents; unknown amounts do not invent evidence',()=>{
  const input=fixtureInput();input.parties.push({...input.parties[1]!,id:'affiliate',roles:['affiliate']});input.parties.find(p=>p.id==='alex')!.affiliates=['affiliate'];
  input.profile.paid_agents=[{id:'agent1',party:'alex',name:'Kiel McDermott',role:'broker',paid_by:'buyer',amount:'unknown'}];
  const rows=evaluateDeal(input,loadPack('sop-50-10-8')).checklist;
  expect(rows.filter(r=>r.item_id==='GUA-09a').map(r=>r.period)).toEqual(['2023','2024','2025']);
  expect(rows.find(r=>r.item_id==='TXN-07')?.scope_key).toBe('agent1');expect(rows.find(r=>r.item_id==='TXN-07')?.status).toBe('missing');
 });
 it('unrelated evidence cannot fill a missing row',()=>{
  const input=fixtureInput();input.segments.find(s=>s.id==='formation')!.doc_type='OTHER_NOT_REQUIRED';
  expect(evaluateDeal(input,loadPack('sop-50-10-8')).checklist.find(r=>r.item_id==='ENT-02')?.status).toBe('missing');
 });
 it('duplicate conflicting confirmations cannot depend on array order',()=>{
  const input=fixtureInput();input.manual_confirmations.push({...input.manual_confirmations[0]!,confirmed:false});
  expect(()=>evaluateDeal(input,loadPack('sop-50-10-8'))).toThrow('Duplicate confirmation');
 });
 it('a present income statement from another period cannot supply balance sheet facts',()=>{
  const input=fixtureInput();const statement=input.segments.find(s=>s.id==='interim')!;
  input.segments.push({...statement,id:'different-interim',period:'2026-07'});
  const assets=input.accepted_facts.find(f=>f.id==='interim:financial.total_assets')!;
  assets.segment_id='different-interim';assets.period='2026-07';input.evidence_inventory.segment_ids.push('different-interim');
  expect(evaluateDeal(input,loadPack('sop-50-10-8')).checklist.find(r=>r.item_id==='TGT-03')?.status).toBe('needs_review');
 });
});

it('ambiguous buyer entities stay unknown and input-order independent',()=>{
 const input=fixtureInput();input.parties.push({...input.parties[0]!,id:'second-buyer'});
 const pack=loadPack('sop-50-10-8'),a=evaluateDeal(input,pack);input.parties.reverse();input.ownership.reverse();
 expect(evaluateDeal(input,pack).result_hash).toBe(a.result_hash);
 expect(a.checklist.find(r=>r.item_id==='TXN-02')?.status).toBe('needs_review');
});
