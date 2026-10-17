import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { DatabaseService } from '../dist/database.service.js';
import { AdminAuthService } from '../dist/admin-auth.service.js';
import { TelegramService } from '../dist/telegram.service.js';
import { TelegramWebhookController } from '../dist/telegram-webhook.controller.js';
import { BotCommandsService } from '../dist/bot-commands.service.js';
import { BotInteractionsService } from '../dist/bot-interactions.service.js';
import { SupportRepository } from '../dist/support.repository.js';
import { ContentService } from '../dist/content.service.js';

config({ path: ['.env.local', '.env'], quiet: true });
// Separate process, fake tokens/recipients and mocked Telegram network: no real messages.
process.env.ADMIN_PASSWORD = 'serverless-integration-password';
process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.PUBLIC_SITE_URL = 'http://localhost:3000';
process.env.TELEGRAM_MODE = 'webhook';
process.env.TELEGRAM_USER_BOT_TOKEN = 'fake-user-token';
process.env.TELEGRAM_ADMIN_BOT_TOKEN = 'fake-admin-token';
process.env.TELEGRAM_ADMIN_IDS = '910000001,910000002';
process.env.TELEGRAM_USER_WEBHOOK_SECRET = randomBytes(32).toString('hex');
const user = 9000000000000 + randomInt(1000000);
const ip = `serverless-check-${user}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const db = new DatabaseService();
const network = globalThis.fetch;
const telegramCalls = [];
let token;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    telegramCalls.push({ method: String(url).split('/').at(-1), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls.length + 100 } }), { headers: { 'Content-Type': 'application/json' } });
  }
  return network(url, options);
};
try {
  const req = { ip, headers: { origin: 'http://localhost:3000' } };
  const response = { cookie: (_name, value) => { token = value; }, clearCookie: () => {} };
  await new AdminAuthService(db).login(req, response, { password: process.env.ADMIN_PASSWORD });
  const authenticated = { ...req, headers: { ...req.headers, cookie: `bakery_admin=${token}` } };
  const anotherInstance = new AdminAuthService(db);
  await anotherInstance.requireSession(authenticated);
  await anotherInstance.logout(authenticated, response);
  await assert.rejects(new AdminAuthService(db).requireSession(authenticated));
  for (let i=0;i<5;i++) await assert.rejects(new AdminAuthService(db).login(req, response, { password: 'incorrect' }));
  await assert.rejects(new AdminAuthService(db).login(req, response, { password: process.env.ADMIN_PASSWORD }), (error) => error.getStatus() === 429);
  console.log('PASS shared admin sessions: cold-instance login, logout revocation and persistent login throttling');

  const content = new ContentService(db);
  const interactions = new BotInteractionsService(new SupportRepository(db), new BotCommandsService(content), content);
  function instance() { return new TelegramService(new BotCommandsService(content), interactions); }
  const transport = instance(); transport.onModuleInit();
  assert.equal(transport.status().user, 'webhook'); assert.equal(telegramCalls.length, 0);
  const open = { update_id: user, message: { message_id: 1, from: { id: user }, chat: { id: user, type: 'private' }, text: '/support' } };
  await new TelegramWebhookController(transport, db).webhook('user', process.env.TELEGRAM_USER_WEBHOOK_SECRET, open);
  const count = telegramCalls.length;
  await new TelegramWebhookController(instance(), db).webhook('user', process.env.TELEGRAM_USER_WEBHOOK_SECRET, open);
  assert.equal(telegramCalls.length, count);
  const send = { update_id: user + 1, message: { ...open.message, message_id: 2, text: 'Serverless support integration check' } };
  await new TelegramWebhookController(instance(), db).webhook('user', process.env.TELEGRAM_USER_WEBHOOK_SECRET, send);
  assert.equal(telegramCalls.filter((entry) => entry.body.reply_markup?.inline_keyboard?.[0]?.[0]?.text === 'Відповісти').length, 2);
  const ticket = await db.query('SELECT id FROM bakery_support_messages WHERE user_id=$1', [user]);
  assert.equal(ticket.rows.length, 1);
  assert.equal(await new SupportRepository(db).inMode(user), false);
  console.log('PASS webhook → Neon → support delivery to both mock admins; duplicate update suppressed across instances; no polling');
  console.log('No real Telegram messages sent; temporary rows removed');
} finally {
  globalThis.fetch = network;
  if (token) await db.query('DELETE FROM bakery_admin_sessions WHERE token_hash=$1', [hash(token)]);
  await db.query('DELETE FROM bakery_admin_failures WHERE ip_hash=$1', [hash(ip)]);
  await db.query('DELETE FROM bakery_telegram_updates WHERE update_id IN ($1,$2)', [user, user+1]);
  await db.query('DELETE FROM bakery_support_messages WHERE user_id=$1', [user]);
  await db.query('DELETE FROM bakery_support_modes WHERE user_id=$1', [user]);
  await db.onApplicationShutdown();
}
