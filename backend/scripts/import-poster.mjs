import { config } from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
config({path:['.env.local','.env'],quiet:true});
const payload=JSON.parse(await readFile('artifacts/poster/import.json','utf8'));
if(payload.products.length!==168 || new Set(payload.products.map(p=>p.id)).size!==168)throw new Error('Unexpected import count or duplicate IDs');
for(const p of payload.products) await readFile(`frontend/public${p.image}`);
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('sslmode','verify-full');
const db=new pg.Client({connectionString:url.toString()});
try{await db.connect();await db.query('BEGIN');const {rows}=await db.query('SELECT content FROM bakery_site_content WHERE id=1 FOR UPDATE');
await writeFile('artifacts/poster/content-before-import.json',JSON.stringify(rows[0].content,null,2));
const content={...rows[0].content,products:payload.products,demo:false};
await db.query('UPDATE bakery_site_content SET content=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(content)]);await db.query('COMMIT');console.log(`PASS Neon: imported ${content.products.length} bakery products; contacts preserved; previous catalogue backed up`);
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(e.code??e.message);process.exitCode=1;}finally{await db.end();}
