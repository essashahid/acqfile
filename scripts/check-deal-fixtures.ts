import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {plans} from '../fixtures/lib/plans';
import {oracle} from '../fixtures/lib/oracle';
import {verifyFiles} from '../fixtures/lib/verify';
import {writeTruth} from '../fixtures/lib/truth';
const legacy=JSON.parse(fs.readFileSync('fixtures/legacy-hashes.json','utf8')) as Record<string,string>;
for(const [file,hash] of Object.entries(legacy))assert.equal(createHash('sha256').update(fs.readFileSync(path.join('fixtures/legacy',file))).digest('hex'),hash,`Legacy hash changed ${file}`);
let failed=false;
for(const p of plans()){if(process.argv.includes('--write-truth')){assert.ok(!fs.existsSync(path.join('fixtures/deals',p.id,'manifest.json')),'Use fixtures:generate once rendered files exist');writeTruth(p,'fixtures/deals');}for(const b of p.batches)try{console.log('PASS',JSON.stringify(oracle(p,b.batch,'fixtures/deals')));}catch(e){failed=true;console.error(e instanceof Error?e.message:e);}}
console.log(`${Object.keys(legacy).length} legacy file hashes unchanged`);
if(failed)process.exitCode=1;

if(!failed)verifyFiles().then(rows=>console.log('PASS readability and synthetic-data lint',JSON.stringify(rows))).catch(e=>{console.error(e);process.exitCode=1;});
