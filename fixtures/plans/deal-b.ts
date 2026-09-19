import {base,doc,add,party,owner,setOwners,checklist,status,finding,plant,key,layout,person} from './shared';
export function dealB(){const p=base('deal-b');party(p,'investor',person(20260926),['buyer_owner','investor']);p.ownership[0]!.percent=85;owner(p,'investor',15);setOwners(p,[{name:p.parties.find(x=>x.id==='alex')!.legal_name,percent:85},{name:p.parties.find(x=>x.id==='investor')!.legal_name,percent:15}]);
 add(p,'investor-citizen','CITIZENSHIP_EVIDENCE','investor');p.confirmations.push({rule:'GUA-05',scope:'investor',key:'citizenship_handling'});
 if(Array.isArray(p.profile.equity_sources))p.profile.equity_sources.push({id:'minority-equity',party:'investor',kind:'minority_investor_equity',amount:90000,source_account_last_four:'7654'});
 add(p,'noncompete','NON_COMPETE','target');add(p,'addback','ADDBACK_SCHEDULE','target');p.tracking.push('TXN-09');
 checklist(p,['alex'],['alex','investor'],p.profile.equity_sources as {id:string;kind:string}[]);
 finding(p,'CON-07');plant(p,'B-LIMITED','Seller note plus minority equity 210000 exceeds 185000 seed limit',['note','funding','owners'],[key('CON-07')]);
 doc(p,'interim').facts['financial.period_end']='2026-04-18';for(const id of ['ar','ap'])doc(p,id).facts['aging.as_of_date']='2026-04-18';status(p,'TGT-03','target','received_with_issues');finding(p,'TGT-03','target',null,'stale');plant(p,18,'150-day interim exceeds overlay 60-day window',['interim','ar','ap'],[key('TGT-03','target')]);
 doc(p,'bank-aug').facts['bank.ending_balance']=100000;doc(p,'pfs').facts['pfs.cash']=100000;finding(p,'CON-08','cash-alex');plant(p,22,'Cash claim exceeds August bank balance; PFS cash follows statement',['bank-aug','pfs','funding'],[key('CON-08','cash-alex')]);
 doc(p,'plan').format='docx';doc(p,'fin-2025').format='xlsx';layout(p,28);return p;}
