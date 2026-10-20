import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { RateLimitService } from '../dist/rate-limit.service.js';
import { TelegramAdminsService } from '../dist/telegram-admins.service.js';
import { BotCommandsService } from '../dist/bot-commands.service.js';
import { BotInteractionsService } from '../dist/bot-interactions.service.js';
import { SupportRepository } from '../dist/support.repository.js';
import { AnalyticsService, kyivDay } from '../dist/analytics.service.js';
import { TelegramWebhookController } from '../dist/telegram-webhook.controller.js';
import { TelegramService } from '../dist/telegram.service.js';

// Real PostgreSQL compiled to WASM, entirely in memory. No credentials are read,
// and no test can reach production through a missing/misconfigured test URL.
const postgres = new PGlite();
const client = { query: async (sql, args) => {
  if (!args && sql.includes(';')) { await postgres.exec(sql); return { rows: [], rowCount: 0 }; }
  const result = await postgres.query(sql, args);
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
} };
const schema = `audit_security_${randomBytes(8).toString('hex')}`;
assert.match(schema, /^audit_security_[a-f0-9]{16}$/);
let savepoint = 0;
const db = {
  query: (sql, args) => client.query(sql, args),
  transaction: async work => {
    const name = `security_check_${++savepoint}`;
    await client.query(`SAVEPOINT ${name}`);
    try { const result = await work(client); await client.query(`RELEASE SAVEPOINT ${name}`); return result; }
    catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${name}`); await client.query(`RELEASE SAVEPOINT ${name}`); throw error; }
  },
};
const owner = 470334534, otherOwner = 5711475783, delegate = 900000000001, visitor = 900000000002;
const message = (id, text, message_id = 1) => ({ from: { id }, chat: { id, type: 'private' }, message_id, text });
process.env.TELEGRAM_USER_BOT_TOKEN = 'mock-only-user'; process.env.TELEGRAM_ADMIN_BOT_TOKEN = 'mock-only-admin';
process.env.TELEGRAM_USER_WEBHOOK_SECRET = 'mock-only-secret';
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network calls forbidden during isolated security verification'); };
try {
  const { default: globHelper } = await import('../../frontend/node_modules/@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
  assert.ok(globHelper.getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: 'frontend/src/*' } } }).some(dir => dir.replace(/\/$/, '') === 'frontend/src/app'));
  console.log('PASS Next.js lint glob compatibility after removing vulnerable braces chain');
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET LOCAL search_path TO ${schema}`);
  // Every table and every fixture belongs only to this new schema. The outer
  // transaction is always rolled back, including the schema and migrations.
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  console.log('PASS migrations in isolated schema; production tables untouched');
  const limits = new RateLimitService(db);
  const admissions = await Promise.allSettled(Array.from({ length: 12 }, () => limits.consume('concurrency', 'client-a', 5, 3600)));
  assert.equal(admissions.filter(result => result.status === 'fulfilled').length, 5);
  await limits.consume('concurrency', 'client-b', 5, 3600);
  await client.query("UPDATE bakery_rate_limits SET window_start=now()-interval '2 hours'");
  await limits.consume('concurrency', 'client-a', 5, 3600);
  console.log('PASS persistent rate limiter: exactly 5/12 concurrent requests accepted, different client and next window allowed');
  const analytics = new AnalyticsService(db, limits);
  const body = { visitorId: randomUUID(), sessionId: randomUUID(), day: kyivDay(), activeMs: 1000 };
  await analytics.record(body, 'analytics-check');
  await client.query('UPDATE bakery_rate_limits SET attempts=120 WHERE attempts=1');
  await assert.rejects(analytics.record({ ...body, sessionId: randomUUID() }, 'analytics-check'), error => error.getStatus() === 429);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM bakery_site_visits')).rows[0].n, 1);
  console.log('PASS analytics: normal event stored, excess event rejected before visit insert');
  const admins = new TelegramAdminsService(db);
  await admins.change(owner, String(delegate), true);
  const commands = new BotCommandsService({ get: async () => ({ products: [] }) }, admins);
  assert.match(await commands.handle('admin', message(delegate, '/status')), /Товарів/);
  await assert.rejects(admins.change(delegate, '900000000003', true), error => error.getStatus() === 403);
  await assert.rejects(admins.change(owner, String(otherOwner), false), error => error.getStatus() === 400);
  assert.match(await commands.handle('admin', message(delegate, '/addadmin 900000000003')), /лише власники/);
  const support = new SupportRepository(db);
  const interactions = new BotInteractionsService(support, commands, {});
  const calls = []; const call = async (_token, method, body) => { calls.push({ method, body }); return { message_id: 100 + calls.length }; };
  await interactions.message('user', message(visitor, '/support'), call);
  await interactions.message('user', message(visitor, 'Test support ticket', 2), call);
  assert.equal(calls.filter(entry => entry.body.reply_markup?.inline_keyboard).length, 3);
  const ticket = (await client.query('SELECT * FROM bakery_support_messages WHERE user_id=$1', [visitor])).rows[0];
  await support.savePrompt(delegate, 600, ticket.id);
  await interactions.message('admin', { ...message(delegate, 'Test answer', 3), reply_to_message: { message_id: 600 } }, call);
  assert.ok(calls.some(entry => String(entry.body.chat_id) === String(visitor) && entry.body.text?.includes('Test answer')));
  await admins.change(otherOwner, String(delegate), false);
  assert.equal(await commands.handle('admin', message(delegate, '/status')), null);
  assert.equal((await client.query('SELECT 1 FROM bakery_support_prompts WHERE admin_id=$1', [delegate])).rowCount, 0);
  const before = calls.length;
  await interactions.callback({ id: 'revoked', from: { id: delegate }, data: `reply:${ticket.id}`, message: message(delegate, '', 100) }, call);
  assert.equal(calls.length, before);
  console.log('PASS Telegram: owner adds delegate, all 3 receive support, delegate can reply, cannot grant roles; revocation invalidates commands and callbacks');
  for (let i = 3; i <= 6; i++) await support.create(visitor, i, 'Test', 'Quota test', [owner, otherOwner]);
  await assert.rejects(support.create(visitor, 7, 'Test', 'Excess', [owner]), error => error.getStatus() === 429);
  assert.equal((await support.create(visitor, 2, 'Test', 'Duplicate', [owner])).id, ticket.id);
  await client.query("UPDATE bakery_support_messages SET created_at=now()-interval '11 minutes' WHERE user_id=$1", [visitor]);
  for (let i = 7; i <= 21; i++) {
    await support.create(visitor, i, 'Test', 'Daily quota test', [owner]);
    await client.query("UPDATE bakery_support_messages SET created_at=now()-interval '11 minutes' WHERE user_id=$1", [visitor]);
  }
  await assert.rejects(support.create(visitor, 22, 'Test', 'Daily excess', [owner]), error => error.getStatus() === 429);
  await client.query("UPDATE bakery_support_messages SET created_at=now()-interval '91 days' WHERE user_id=$1", [visitor]);
  await support.cleanup();
  assert.equal((await client.query('SELECT count(*)::int AS n FROM bakery_support_messages')).rows[0].n, 0);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM bakery_support_deliveries')).rows[0].n, 0);
  console.log('PASS support: 5/10-minute and 20/day quotas, duplicate idempotency, 90-day cascading cleanup');
  const counted = [];
  const transport = new TelegramService(commands, { message: async () => { counted.push('message'); return true; } }, limits);
  for (let i = 0; i < 22; i++) await transport.handleUpdate('user', { update_id: 100 + i, message: message(visitor, '/start', i + 100) });
  assert.equal(counted.length, 20);
  console.log('PASS Telegram transport: excess commands dropped before outgoing bot calls');
  let processed = 0, unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const webhook = new TelegramWebhookController({ handleUpdate: async () => { processed++; await gate; } }, db);
  const update = { update_id: 1, message: message(visitor, '/start') };
  const first = webhook.webhook('user', 'mock-only-secret', update);
  while (!processed) await new Promise(resolve => setTimeout(resolve, 5));
  // Savepoint transactions use the same test connection; the first handler is
  // paused outside its DB transaction, so another request can safely proceed.
  await assert.rejects(webhook.webhook('user', 'mock-only-secret', update), error => error.getStatus() === 503);
  unblock(); await first; await webhook.webhook('user', 'mock-only-secret', update);
  assert.equal(processed, 1);
  assert.equal((await client.query('SELECT 1 FROM bakery_telegram_leases')).rowCount, 0);
  console.log('PASS webhook leases: concurrent duplicate waits for retry, successful duplicate suppressed, DB lease released');
} finally {
  globalThis.fetch = network;
  await client.query('ROLLBACK').catch(() => {}); await postgres.close();
  console.log('ROLLBACK complete: test schema and all fixtures discarded; no Telegram messages sent');
}
