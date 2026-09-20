import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {officialForm} from '../../src/lib/config/official-form-fields';
import {display} from './truth';
import {plans} from './plans';
import {groups,documents} from './truth';
import {content,cue,sheetContent} from './content';
import {PASSWORD,verifyAcroform} from './render';
import type {Manifest} from '../../scripts/generate-deal-fixtures';
export const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
export function lintSynthetic(text:string){for(const m of text.matchAll(/\b(\d{3})-(\d{2})-(\d{4})\b/g))assert.ok(Number(m[1])>=900,`SSN outside synthetic range: ${m[0]}`);for(const m of text.matchAll(/\b(\d{2})-(\d{7})\b/g))assert.equal(m[1],'00','EIN outside synthetic range');for(const m of text.matchAll(/\(?\b(\d{3})\)?[ .-]+(\d{3})[ .-]+(\d{4})\b/g))assert.ok(m[2]==='555'&&m[3]!.startsWith('01'),`Phone outside synthetic range: ${m[0]}`);for(const m of text.matchAll(/[\w.+-]+@([\w.-]+\.[A-Za-z]{2,})/g))assert.equal(m[1],'example.com','Non-example email');}
export function lintRepositoryNames(){const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);const old=[['North','field'].join(''),['Harbor','view'].join('')];for(const file of files){if(!fs.existsSync(file)||file==='docs/SPEC.md'||file==='docs/SPEC_AMENDMENTS.md'||/^docs\/PHASE_\d+\.md$/.test(file))continue;if(/\.(pdf|xlsx|docx|zip|png|jpg|tgz)$/i.test(file))continue;const text=fs.readFileSync(file,'utf8');for(const name of old)assert.ok(!text.toLowerCase().includes(name.toLowerCase()),`${file}: forbidden former name`);}}
export async function verifyFiles(){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const results=[];for(const p of plans()){const root=path.join('fixtures/deals',p.id);const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')) as Manifest;const truth=JSON.parse(fs.readFileSync(path.join(root,'truth/documents.json'),'utf8')) as ReturnType<typeof documents>;let pages=0,fields=0;const formats:Record<string,number>={};
 for(const {file,docs} of groups(p)){const first=docs[0]!;const bytes=fs.readFileSync(path.join(root,file));const entry=manifest.files.find(f=>f.path===file)!;assert.ok(entry);assert.equal(hash(bytes),entry.sha256);assert.equal(bytes.length,entry.bytes);const record=truth.find(d=>d.file===file)!;assert.equal(record.hash,entry.sha256);assert.equal(record.bytes,entry.bytes);formats[entry.format]=(formats[entry.format]??0)+1;pages+=entry.pages;
  for(const d of docs)lintSynthetic(content(p,d).join('\n'));
  if(first.duplicate_of){const source=p.documents.find(d=>d.id===first.duplicate_of)!;assert.deepEqual(bytes,fs.readFileSync(path.join(root,source.path)));continue;}
  if(first.format==='docx'){const raw=await mammoth.extractRawText({buffer:bytes});for(const d of docs)for(const line of content(p,d))assert.ok(normalize(raw.value).includes(normalize(line)),`${file}: DOCX missing ${line}`);lintSynthetic(raw.value);const zip=await JSZip.loadAsync(bytes);assert.ok((await zip.file('word/document.xml')!.async('string')).includes('SYNTHETIC'));continue;}
  if(first.format==='xlsx'){const book=XLSX.read(bytes,{type:'buffer'});assert.deepEqual(book.SheetNames,['Income Statement','Balance Sheet']);for(const name of book.SheetNames){const text=XLSX.utils.sheet_to_csv(book.Sheets[name]!);assert.ok(text.includes('SYNTHETIC'));lintSynthetic(text);for(const d of docs)for(const line of sheetContent(p,d,name))assert.ok(text.includes(line.replaceAll('"','""')),`${file}/${name}: XLSX missing ${line}`);}continue;}
  if(first.format==='acroform_pdf')fields+=await verifyAcroform(bytes,docs);
  if(first.unreadable){await assert.rejects(PDFDocument.load(bytes),/encrypted/i);try{await pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0}).promise;assert.fail('Protected PDF opened without password');}catch(e){assert.equal((e as {name:string}).name,'PasswordException');}assert.equal(record.segments.length,0);assert.equal(record.facts.length,0);}
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),...(first.unreadable?{password:PASSWORD}:{}),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts')+'/',verbosity:0});const pdf=await task.promise;
  assert.equal(pdf.numPages,entry.pages);for(let page=1;page<=pdf.numPages;page++){const pg=await pdf.getPage(page);const items=await pg.getTextContent();const text=items.items.map(x=>'str' in x?x.str:'').join(' ');if(first.format==='scan_pdf'){assert.ok(text.length<100,`${file}: scan contains a text layer`);const ops=await pg.getOperatorList();assert.ok(ops.fnArray.includes(pdfjs.OPS.paintImageXObject),'Scan missing page image');}else{assert.ok(text.includes('SYNTHETIC'),`${file}/${page}: watermark missing`);if(officialForm(first.type)){/* Decision 55: printed agency contacts on official pages are government boilerplate; authored values are linted through content() and AcroForm readback. */continue;}const d=docs[page-1]!;assert.ok(normalize(text).includes(normalize(cue(d))),`${file}: classification cue missing`);for(const line of content(p,d))assert.ok(normalize(text).includes(normalize(line)),`${file}/${page}: missing ${line}`);for(const fact of record.facts.filter(f=>f.locator.page===page))assert.ok(normalize(text).includes(normalize(fact.locator.quote)),`${file}: truth quote absent`);lintSynthetic(text);}}
  // A36: official-form facts are field values on the widget's page; the signature mark is page content inside the signature widget.
  if(officialForm(first.type)&&!first.unreadable){for(const fact of record.facts){assert.equal(fact.locator.quote,display(first.facts[fact.attribute]),`${file}: official quote is not the field value`);assert.ok(fact.locator.source_block.startsWith(first.format==='scan_pdf'?'page-':'field:'),`${file}: official locator kind`);if(first.format==='scan_pdf')assert.equal(fact.locator.verbatim,false);}if(first.format!=='scan_pdf'){const sig=record.segments[0]!.metadata_locator;const text=(await (await pdf.getPage(sig.page)).getTextContent()).items.map(x=>'str' in x?x.str:'').join(' ');assert.equal(text.includes(`e-signed / SYNTHETIC-${first.id}`),!!first.metadata.signed,`${file}: signature mark`);}}
  await task.destroy();
 }
 for(const archive of manifest.archives){const bytes=fs.readFileSync(path.join(root,archive.path));assert.equal(hash(bytes),archive.sha256);const zip=await JSZip.loadAsync(bytes);const batch=Number(archive.path.match(/\d+/)![0]);const entries=manifest.files.filter(f=>f.batch===batch);assert.equal(Object.keys(zip.files).length,entries.length);for(const f of entries)assert.deepEqual(await zip.file(f.path.replace(`incoming/batch-${batch}/`,''))!.async('nodebuffer'),fs.readFileSync(path.join(root,f.path)));}
 for(const f of manifest.truth)assert.equal(hash(fs.readFileSync(path.join(root,f.path))),f.sha256);
 results.push({deal:p.id,files:manifest.files.length,pages,acroform_fields:fields,formats});
 }lintRepositoryNames();return results;}
