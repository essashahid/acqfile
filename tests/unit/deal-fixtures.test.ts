import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {plans,checkPlan,checkModel} from '../../fixtures/lib/plans';
import {base,doc,key} from '../../fixtures/plans/shared';
import {engineInput,documents} from '../../fixtures/lib/truth';
import {oracle} from '../../fixtures/lib/oracle';
import {evaluateDeal} from '@/lib/rules/engine';
import {loadPack} from '@/lib/rules/loader';
const all=plans();
describe('independent deal plans',()=>{
 for(const p of all){
  it(`${p.id}: clean financial model ties before departures`,()=>{const clean=base(p.id as 'deal-a'|'deal-b'|'deal-c');checkModel(clean);for(const y of ['2023','2024','2025']){expect(doc(clean,`tax-${y}`).facts['tax.gross_receipts']).toBe(doc(clean,`fin-${y}`).facts['financial.revenue']);expect(doc(clean,`tax-${y}`).facts['tax.net_income']).toBe(doc(clean,`fin-${y}`).facts['financial.net_income']);}expect(doc(clean,'pfs').facts['pfs.cash']).toBe(doc(clean,'bank-aug').facts['bank.ending_balance']);});
  for(const b of p.batches)it(`${p.id}/batch-${b.batch}: exact authored oracle`,()=>{expect(oracle(p,b.batch).rows).toBe(b.checklist.length);const input=engineInput(p,b.batch);expect(input.evidence_inventory.segment_ids.sort()).toEqual(input.segments.map(s=>s.id).sort());expect(input.evidence_inventory.fact_ids.sort()).toEqual(input.accepted_facts.map(f=>f.id).sort());});
 }
 it('three and only three A fixes arrive in batch 2',()=>{const p=all[0]!;expect(new Set(p.documents.filter(d=>d.batch===2).map(d=>d.path)).size).toBe(3);const before=p.batches[0]!.findings.map(f=>key(f.rule_id,f.scope_key,f.period));const after=p.batches[1]!.findings.map(f=>key(f.rule_id,f.scope_key,f.period));expect(before.filter(k=>!after.includes(k)).sort()).toEqual([...p.batches[1]!.resolves].sort());expect(after.filter(k=>!before.includes(k))).toEqual([]);});
 it('superseded and unreadable evidence never enter an inventory',()=>{for(const p of all)for(const b of p.batches){const input=engineInput(p,b.batch);const excluded=p.documents.filter(d=>d.unreadable||p.documents.some(v=>v.batch<=b.batch&&v.supersedes===d.id)).map(d=>d.id);expect(input.segments.some(s=>excluded.includes(s.id))).toBe(false);for(const d of documents(p).filter(d=>d.pipeline.unreadable)){expect(d.segments).toEqual([]);expect(d.facts).toEqual([]);}}});
 it('personal scopes do not request Form 413 from an intermediate LLC',()=>{const p=all[0]!;const out=evaluateDeal(engineInput(p,1),loadPack(p.pack));expect(out.checklist.some(r=>r.scope_key==='holding'&&r.item_id==='GUA-01')).toBe(false);expect(out.checklist.some(r=>r.scope_key==='bea'&&r.item_id==='GUA-01')).toBe(true);expect(out.checklist.some(r=>r.scope_key==='holding'&&r.item_id==='GUA-09b')).toBe(true);});
 it('invalid fact producer and broken financial models are rejected',()=>{const bad=structuredClone(all[0]!);doc(bad,'license').facts['pfs.cash']=10;expect(()=>checkPlan(bad)).toThrow();const model=structuredClone(all[0]!);model.model.loan++;expect(()=>checkModel(model)).toThrow();});
 it('truth authors cannot import the evaluator, parser or model providers',()=>{for(const f of ['fixtures/plans/shared.ts','fixtures/plans/deal-a.ts','fixtures/plans/deal-b.ts','fixtures/plans/deal-c.ts','fixtures/lib/truth.ts'])expect(fs.readFileSync(f,'utf8')).not.toMatch(/from\s+['"][^'"]*(?:rules\/engine|lib\/parsers|lib\/llm|openai)/);});
});

describe('rendered fixture proof without the application pipeline',()=>{
 it('all committed files are readable in their declared format and match truth locators',async()=>{const {verifyFiles}=await import('../../fixtures/lib/verify');const result=await verifyFiles();expect(result.map(r=>r.files)).toEqual([40,28,22]);},60000);
 it('synthetic lint rejects unsafe identifier/contact ranges and outcome wording',async()=>{const {lintSynthetic}=await import('../../fixtures/lib/verify');for(const text of ['123-45-6789','12-1234567','(202) 555-9999','person@invalid.test','approved'])expect(()=>lintSynthetic(text)).toThrow();expect(()=>lintSynthetic('900-12-3456 00-1234567 (202) 555-0142 fixture@example.com SYNTHETIC')).not.toThrow();});
});
