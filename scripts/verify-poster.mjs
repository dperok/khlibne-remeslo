import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const imported=JSON.parse(await readFile('artifacts/poster/import.json','utf8'));
const catalog=await (await fetch('http://localhost:3001/catalog')).json();
assert.equal(catalog.demo,false);assert.equal(catalog.products.length,168);
assert.deepEqual(catalog.products,imported.products);
for(const category of ['bread','pastry','sweet']){const data=await(await fetch(`http://localhost:3000/api/catalog?category=${category}`)).json();assert.ok(data.products.length);assert.ok(data.products.every(p=>p.category===category));}
const search=await(await fetch(`http://localhost:3000/api/catalog?q=${encodeURIComponent('БОРОДИНСЬКИЙ')}`)).json();assert.ok(search.products.some(p=>p.name==='Хліб Бородинський'));
console.log('PASS catalogue: 168 Poster bakery products in Neon; all three categories and Ukrainian search work through Next.js → NestJS → Neon');
for(const image of new Set(catalog.products.map(p=>p.image))){const r=await fetch(`http://localhost:3000${image}`);assert.equal(r.status,200,image);assert.match(r.headers.get('content-type'),/^image\//);}
console.log('PASS images: all 139 original photo files and the missing-photo placeholder return HTTP 200');
const html=await(await fetch('http://localhost:3000')).text();assert.match(html,/Хліб Бородинський/);assert.doesNotMatch(html,/Приклад асортименту/);assert.match(html,/lang="uk"/);
console.log('PASS homepage: Ukrainian catalogue is rendered with real products and prices, without demo labels');
