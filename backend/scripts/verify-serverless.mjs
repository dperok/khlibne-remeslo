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
process.env.TELEGRAM_ADMIN_WEBHOOK_SECRET = randomBytes(32).toString('hex');
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
  const store = new SupportRepository(db);
  const ticketId = ticket.rows[0].id;
  const adminA = 910000001, adminB = 910000002;
  await store.savePrompt(adminA, 500, ticketId); await store.savePrompt(adminB, 501, ticketId);
  const adminMessage = (admin, messageId, promptId, text) => ({ message_id: messageId, from: { id: admin }, chat: { id: admin, type: 'private' }, reply_to_message: { message_id: promptId }, text });
  const webhookAdmin = update => new TelegramWebhookController(instance(), db).webhook('admin', process.env.TELEGRAM_ADMIN_WEBHOOK_SECRET, update);
  const visitorAnswers = () => telegramCalls.filter(entry => entry.method === 'sendMessage' && String(entry.body.chat_id) === String(user) && entry.body.text.startsWith('Відповідь пекарні:')).length;
  await webhookAdmin({ update_id: user+2, message: adminMessage(adminA, 600, 500, 'First answer') });
  assert.equal(visitorAnswers(), 1);
  await webhookAdmin({ update_id: user+3, message: adminMessage(adminB, 601, 501, 'Additional answer') });
  assert.equal(visitorAnswers(), 1);
  const confirmation = (await db.query('SELECT * FROM bakery_support_reply_confirmations WHERE admin_id=$1 AND ticket_id=$2', [adminB,ticketId])).rows[0];
  assert.ok(confirmation); assert.equal(confirmation.message_text, 'Additional answer');
  const callback = admin => ({ id: 'test-confirm', from: { id: admin }, data: `confirm:${confirmation.id}`, message: { message_id: Number(confirmation.prompt_id), chat: { id: admin, type: 'private' } } });
  await webhookAdmin({ update_id: user+4, callback_query: callback(adminA) }); assert.equal(visitorAnswers(), 1);
  await webhookAdmin({ update_id: user+5, callback_query: callback(adminB) }); assert.equal(visitorAnswers(), 2);
  await webhookAdmin({ update_id: user+6, callback_query: callback(adminB) }); assert.equal(visitorAnswers(), 2);
  assert.equal((await db.query('SELECT 1 FROM bakery_support_reply_confirmations WHERE id=$1', [confirmation.id])).rowCount, 0);
  console.log('PASS first answer immediate; second admin with old prompt requires persisted confirmation; wrong admin and duplicate confirmation cannot send');
  console.log('No real Telegram messages sent; temporary rows removed');
} finally {
  globalThis.fetch = network;
  if (token) await db.query('DELETE FROM bakery_admin_sessions WHERE token_hash=$1', [hash(token)]);
  await db.query('DELETE FROM bakery_admin_failures WHERE ip_hash=$1', [hash(ip)]);
  await db.query('DELETE FROM bakery_telegram_updates WHERE update_id=ANY($1::bigint[])', [Array.from({length:7},(_,i)=>user+i)]);
  await db.query('DELETE FROM bakery_support_messages WHERE user_id=$1', [user]);
  await db.query('DELETE FROM bakery_support_modes WHERE user_id=$1', [user]);
  await db.onApplicationShutdown();
}
