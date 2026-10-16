import { config } from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { bakery, catalog } from '../dist/catalog.data.js';

config({ path: [fileURLToPath(new URL('../../.env.local', import.meta.url)), fileURLToPath(new URL('../../.env', import.meta.url))], quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is required for migrations');
const url = new URL(connectionString);
url.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  await client.query('INSERT INTO bakery_site_content (id, content) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify({ products: catalog.map((product) => ({ ...product, visible: true })), bakery, demo: true })]);
  await client.query('COMMIT');
  console.log('PASS migrations: content and analytics tables ready; existing content preserved');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Content migration failed:', error.code ?? 'connection error');
  process.exitCode = 1;
} finally { await client.end(); }
