import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { DatabaseService } from '../dist/database.service.js';
import { PosterService } from '../dist/poster.service.js';

config({ path: ['.env.local', '.env'], quiet: true });
const db = new DatabaseService();
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = (input, options) => {
  const url = new URL(input);
  assert.equal(url.origin, 'https://joinposter.com');
  assert.ok(['/api/menu.getProducts', '/api/storage.getStorageLeftovers'].includes(url.pathname));
  assert.equal(options.method, 'GET');
  requests.push(url.pathname);
  return originalFetch(input, options);
};
const withoutAvailability = content => ({ ...content, products: content.products.map(product => { const { available, ...rest } = product; return rest; }) });
try {
  const before = (await db.query('SELECT content FROM bakery_site_content WHERE id=1')).rows[0].content;
  const service = new PosterService(db);
  const summary = await service.sync();
  const after = (await db.query('SELECT content FROM bakery_site_content WHERE id=1')).rows[0].content;
  assert.deepEqual(withoutAvailability(after), withoutAvailability(before));
  assert.equal(requests.length, 2);
  assert.ok(summary.matched > 0);
  const status = await service.status();
  assert.ok(status.lastSuccessAt); assert.equal(status.lastError, null);
  assert.equal(JSON.stringify(status).includes(process.env.POSTER_API_TOKEN), false);
  console.log(`PASS Poster API -> NestJS -> Neon: ${summary.matched} balances matched; ${summary.changed} availability changes; ${summary.untracked} untracked; ${summary.manual} manual`);
  console.log('PASS only GET reads sent to Poster; prices, catalogue details and contacts preserved; sync status persisted without API secrets');
} finally { globalThis.fetch = originalFetch; await db.onApplicationShutdown(); }
