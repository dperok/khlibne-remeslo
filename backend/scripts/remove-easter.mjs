import { config } from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
config({ path: ['.env.local', '.env'], quiet: true });
const sources = [...JSON.parse(await readFile('artifacts/poster/dishes1.json', 'utf8')), ...JSON.parse(await readFile('artifacts/poster/dishes2.json', 'utf8'))];
const ids = new Set(sources.filter((p) => p.category === 'Паска').map((p) => `poster-dish-${p.href.split('/').at(-1)}`));
const url = new URL(process.env.DATABASE_URL); url.searchParams.set('sslmode', 'verify-full');
const db = new pg.Client({ connectionString: url.toString() });
try {
  await db.connect(); await db.query('BEGIN');
  const { rows } = await db.query('SELECT content FROM bakery_site_content WHERE id=1 FOR UPDATE');
  const content = rows[0].content;
  const removed = content.products.filter((p) => ids.has(p.id) || /^(паска|пасха|кулич)(?:\s|$)/iu.test(p.name));
  if (removed.length) {
    await writeFile(`artifacts/poster/removed-easter-${Date.now()}.json`, JSON.stringify(removed, null, 2));
    content.products = content.products.filter((p) => !removed.includes(p));
    await db.query('UPDATE bakery_site_content SET content=$1::jsonb,updated_at=now() WHERE id=1', [JSON.stringify(content)]);
  }
  await db.query('COMMIT');
  console.log(`PASS: removed ${removed.length} Easter products; ${content.products.length} products remain; backup saved`);
  console.log(removed.map((p) => p.name).join('\n'));
} catch (error) { await db.query('ROLLBACK').catch(() => {}); console.error(error.code ?? 'Removal failed'); process.exitCode = 1; }
finally { await db.end(); }
