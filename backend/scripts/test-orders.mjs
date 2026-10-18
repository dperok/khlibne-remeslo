// Exercises the real SQL/service in temporary tables; production rows are untouched.
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { OrdersService } from '../dist/orders.service.js';
config({ path: ['.env.local', '.env'], quiet: true });
const url = new URL(process.env.DATABASE_URL_UNPOOLED); url.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  const sql = (await readFile(new URL('../migrations/012_orders.sql', import.meta.url), 'utf8')).replace('CREATE TABLE IF NOT EXISTS bakery_orders', 'CREATE TEMP TABLE bakery_orders');
  await client.query(sql); await client.query(sql.replace('CREATE TEMP TABLE bakery_orders', 'CREATE TEMP TABLE IF NOT EXISTS bakery_orders'));
  await client.query('CREATE TEMP TABLE bakery_site_content (id smallint PRIMARY KEY, content jsonb)');
  await client.query('INSERT INTO bakery_site_content VALUES (1,$1)', [JSON.stringify({ products: [{ id: 'test-bread', name: 'Тестовий хліб', visible: true, available: true, price: 31.25 }, { id: 'absent', available: false, price: 10 }], bakery: { fullAddress: 'Тестова адреса' } })]);
  const service = new OrdersService({ transaction: work => work(client), query: (sql, values) => client.query(sql, values) });
  const input = { id: randomUUID(), token: randomBytes(32).toString('hex'), customerName: 'Тест', phone: '0660000000', items: [{ id: 'test-bread', quantity: 2 }], totalKopecks: 1, paymentStatus: 'paid' };
  const order = await service.create(input);
  assert.equal(order.totalKopecks, 6250); assert.equal(order.paymentStatus, 'unpaid');
  assert.equal((await service.create(input)).number, order.number);
  assert.equal((await service.list()).length, 1);
  await assert.rejects(service.create({ ...input, customerName: 'Інше ім’я' }));
  await assert.rejects(service.customerOrder(order.id, '0'.repeat(64), true));
  assert.equal((await service.list()).length, 1);
  assert.equal((await service.customerOrder(order.id, input.token, true)).status, 'cancelled');
  assert.equal((await service.list()).length, 0);
  assert.equal((await service.customerOrder(order.id, input.token, true)).status, 'cancelled');
  await assert.rejects(service.update(order.id, 'new'));
  await assert.rejects(service.create({ ...input, id: randomUUID(), items: [{ id: 'absent', quantity: 1 }] }));
  const second = await service.create({ ...input, id: randomUUID() });
  await service.update(second.id, 'completed');
  await assert.rejects(service.customerOrder(second.id, input.token, true));
  console.log('PASS orders SQL: migration repeatable, server prices, unpaid, retry deduplication, token protection, cancellation hidden from admin, completed-order guard, unavailable-item guard');
} finally { await client.query('ROLLBACK'); await client.end(); }
