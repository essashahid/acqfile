'use server';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '@/lib/workspace';
import {saveDeal} from '@/lib/deals/service';
import {intake} from '@/lib/deals/intake';
export async function saveDealAction(raw:unknown,id?:string,revision?:number){const context=await requireWorkspace();const dealId=await saveDeal(context,raw,id,revision);revalidatePath('/deals');return dealId;}
export async function uploadDealAction(dealId:string,data:FormData){const context=await requireWorkspace();const files=data.getAll('files').filter((v):v is File=>v instanceof File);const paths=data.getAll('paths').map(String);const result=await intake(context,dealId,await Promise.all(files.map(async(f,i)=>({path:paths[i]??f.name,bytes:Buffer.from(await f.arrayBuffer())}))));revalidatePath(`/deals/${dealId}`);return {batch:result.batch.number,count:result.rows.length};}
