import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { randomInt } from 'node:crypto';
import { DatabaseService } from '../dist/database.service.js';
import { ContentService } from '../dist/content.service.js';
import { SupportRepository } from '../dist/support.repository.js';
import { BotCommandsService } from '../dist/bot-commands.service.js';
import { BotInteractionsService } from '../dist/bot-interactions.service.js';

config({ path: ['.env.local', '.env'], quiet: true });
// Isolated fake recipients: this script never invokes Telegram or uses the live allowlist.
process.env.TELEGRAM_ADMIN_IDS = '910000001,910000002';
process.env.TELEGRAM_USER_BOT_TOKEN = 'test-user';
process.env.TELEGRAM_ADMIN_BOT_TOKEN = 'test-admin';
const userId = 9000000000000 + randomInt(1000000);
const db = new DatabaseService();
const content = new ContentService(db);
const commands = new BotCommandsService(content);
let sequence = 100;
const requests = [];
const call = async (token, method, body) => {
  const messageId = ++sequence;
  requests.push({ token, method, body, messageId });
  return { message_id: messageId };
};
const message = (text) => ({ message_id: 71, chat: { id: userId, type: 'private' }, from: { id: userId, first_name: 'Integration test' }, text });
try {
  const store = new SupportRepository(db);
  const service = new BotInteractionsService(store, commands, content);
  await service.message('user', message('/support'), call);
  await service.message('user', message('Integration test request'), call);
  const notifications = requests.filter((entry) => entry.token === 'test-admin' && entry.body.reply_markup?.inline_keyboard);
  assert.equal(notifications.length, 2);
  const notification = notifications.find((entry) => entry.body.chat_id === 910000002);
  const data = notification.body.reply_markup.inline_keyboard[0][0].callback_data;
  const restarted = new BotInteractionsService(new SupportRepository(db), commands, content);
  await restarted.callback({ id: 'test-callback', from: { id: 910000002 }, data,
    message: { message_id: notification.messageId, chat: { id: 910000002, type: 'private' } } }, call);
  const prompt = requests.find((entry) => entry.body.reply_markup?.force_reply);
  assert.ok(prompt);
  const restartedAgain = new BotInteractionsService(new SupportRepository(db), commands, content);
  const reply = { message_id: 81, from: { id: 910000002 }, chat: { id: 910000002, type: 'private' }, reply_to_message: { message_id: prompt.messageId }, text: 'Integration test answer' };
  await restartedAgain.message('admin', reply, call);
  assert.ok(requests.some((entry) => entry.token === 'test-user' && entry.body.chat_id === String(userId) && entry.body.text.includes('Integration test answer')));
  const statuses = requests.filter((entry) => entry.method === 'editMessageReplyMarkup');
  assert.equal(statuses.length, 2);
  assert.ok(statuses.every((entry) => entry.body.reply_markup.inline_keyboard[0][0].text.includes('Вже відповіли')));
  const notified = await db.query('SELECT count(*)::int AS n FROM bakery_support_deliveries d JOIN bakery_support_messages m ON m.id=d.ticket_id WHERE m.user_id=$1 AND d.reply_status_notified', [userId]);
  assert.equal(notified.rows[0].n, 2);
  const count = requests.filter((entry) => entry.token === 'test-user').length;
  await restartedAgain.message('admin', reply, call);
  assert.equal(requests.filter((entry) => entry.token === 'test-user').length, count);
  console.log('PASS shared reply status: both admin messages marked answered and notifications recorded in Neon');
  console.log('PASS support: two distinct admin deliveries with reply buttons');
  console.log('PASS Neon routing: ticket and prompt survive new service instances; reply returns to the right visitor');
  console.log('PASS duplicate admin update: reply is not sent twice');
  console.log('Telegram calls were mocked; no real users or administrators were messaged');
} finally {
  await db.query('DELETE FROM bakery_support_messages WHERE user_id=$1', [userId]);
  await db.query('DELETE FROM bakery_support_modes WHERE user_id=$1', [userId]);
  await db.onApplicationShutdown();
}
