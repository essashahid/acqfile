import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {plans} from '../fixtures/lib/plans';
import {oracle} from '../fixtures/lib/oracle';
import {verifyFiles} from '../fixtures/lib/verify';
import {writeTruth} from '../fixtures/lib/truth';
let failed=false;
for(const p of plans()){if(process.argv.includes('--write-truth')){assert.ok(!fs.existsSync(path.join('fixtures/deals',p.id,'manifest.json')),'Use fixtures:generate once rendered files exist');writeTruth(p,'fixtures/deals');}for(const b of p.batches)try{console.log('PASS',JSON.stringify(oracle(p,b.batch,'fixtures/deals')));}catch(e){failed=true;console.error(e instanceof Error?e.message:e);}}
if(failed)process.exitCode=1;

if(!failed)verifyFiles().then(rows=>console.log('PASS readability and synthetic-data lint',JSON.stringify(rows))).catch(e=>{console.error(e);process.exitCode=1;});
