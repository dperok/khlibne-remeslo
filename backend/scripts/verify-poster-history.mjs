import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { DatabaseService } from '../dist/database.service.js';
import { PosterService } from '../dist/poster.service.js';
config({ path: ['.env.local', '.env'], quiet: true });
const db = new DatabaseService();
const originalFetch = globalThis.fetch;
let quantity = '-3';
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(options.method, 'GET'); assert.equal(url.origin, 'https://joinposter.com');
  const response = url.pathname.endsWith('menu.getProducts')
    ? [{ product_id: '35', ingredient_id: '144' }]
    : [{ ingredient_id: '144', ingredients_type: '2', ingredient_left: quantity }];
  return new Response(JSON.stringify({ response }));
};
try {
  await db.transaction(async client => {
    // PostgreSQL temporary tables shadow live tables only in this connection.
    // No synthetic stock or catalogue values are written to the live tables.
    for (const table of ['bakery_site_content', 'bakery_poster_sync', 'bakery_poster_stock_history', 'bakery_poster_alerts']) {
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
      const check = await client.query('SELECT relnamespace=pg_my_temp_schema() AS temporary FROM pg_class WHERE oid=to_regclass($1)', [table]);
      assert.equal(check.rows[0].temporary, true);
    }
    const content = { products: [{ id: 'poster-product-35', name: 'Тест', available: false, price: 25 }], bakery: { name: 'Тест' }, demo: false };
    await client.query('INSERT INTO bakery_site_content(id,content) VALUES(1,$1::jsonb)', [JSON.stringify(content)]);
    await client.query('INSERT INTO bakery_poster_sync(id) VALUES(1)');
    const isolatedDb = { query: client.query.bind(client), transaction: work => work(client) };
    const service = new PosterService(isolatedDb);
    const read = async () => (await client.query('SELECT content FROM bakery_site_content WHERE id=1')).rows[0].content;
    assert.equal((await service.sync()).learning, 1); assert.equal((await read()).products[0].available, false);
    quantity = '-4';
    assert.equal((await service.sync()).changed, 1); assert.equal((await read()).products[0].available, true);
    const changed = (await client.query('SELECT last_changed_at FROM bakery_poster_stock_history')).rows[0].last_changed_at;
    await service.sync();
    assert.deepEqual((await client.query('SELECT last_changed_at FROM bakery_poster_stock_history')).rows[0].last_changed_at, changed);
    await client.query("UPDATE bakery_poster_stock_history SET last_changed_at=now()-interval '25 hours',first_observed_at=now()-interval '26 hours'");
    assert.equal((await service.sync()).changed, 1); assert.deepEqual(await read(), content);
    console.log('PASS isolated Neon history: initial baseline preserved; negative decrease enables stock; unchanged sample keeps timestamp; 24-hour expiry disables stock');
    console.log('PASS all synthetic writes used session-only temporary tables; live catalogue and Poster unchanged');
  });
} finally { globalThis.fetch = originalFetch; await db.onApplicationShutdown(); }
