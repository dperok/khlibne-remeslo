import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {config} from 'dotenv';
import {DatabaseService} from '../dist/database.service.js';
config({path:['.env.local','.env'],quiet:true});
const operation=JSON.parse(await readFile(process.argv[2]??'operations/2026-10-18-catalog-details.json','utf8'));
const reverting=process.argv.includes('--revert');
const fields=['description','ingredients','allergens'];
assert.ok(Array.isArray(operation.products)&&operation.products.length>0);
assert.equal(new Set(operation.products.map(p=>p.id)).size,operation.products.length);
for(const patch of operation.products) for(const field of fields){assert.equal(typeof patch[field],'string');assert.equal(typeof patch.before[field],'string');assert.ok(patch[field].length<=(field==='allergens'?500:1500));}
const db=new DatabaseService();
try {
 await db.transaction(async client=>{
  const before=(await client.query('SELECT content FROM bakery_site_content WHERE id=1 FOR UPDATE')).rows[0].content;
  await mkdir('artifacts/poster',{recursive:true});await writeFile(`artifacts/poster/content-before-details-${Date.now()}.json`,JSON.stringify(before,null,2));
  const after=structuredClone(before);let changed=0;
  for(const patch of operation.products){
   const product=after.products.find(p=>p.id===patch.id);assert.ok(product,`Missing ${patch.id}`);assert.equal(product.name,patch.name,`Renamed ${patch.id}`);
   for(const field of fields){const expected=reverting?patch[field]:patch.before[field];const desired=reverting?patch.before[field]:patch[field];const current=product[field]??'';assert.ok(current===expected||current===desired,`Concurrent edit: ${patch.id} ${field}`);if(current!==desired){product[field]=desired;changed++;}}
  }
  const strip=content=>({...content,products:content.products.map(product=>{const clone={...product};for(const field of fields)delete clone[field];return clone;})});
  assert.deepEqual(strip(after),strip(before));
  if(changed)await client.query('UPDATE bakery_site_content SET content=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(after)]);
  console.log(`PASS ${reverting?'reverted':'applied'} catalogue details: ${operation.products.length} products, ${changed} field changes; names, photos, prices, visibility, availability and contacts preserved`);
 });
}finally{await db.onApplicationShutdown();}
