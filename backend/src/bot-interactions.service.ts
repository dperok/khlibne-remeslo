import { HttpException, Injectable } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { receivesServiceNotifications } from './admin-notifications.js';
import { BotCommandsService } from './bot-commands.service.js';
import type { BotMessage, BotRole } from './bot-commands.service.js';
import { SupportRepository } from './support.repository.js';
import type { Ticket } from './support.repository.js';

export type TelegramCall = <T>(token: string, method: string, body: Record<string, unknown>) => Promise<T>;
export type BotCallback = { id: string; from: { id: number; first_name?: string; username?: string }; data?: string; message?: BotMessage };
const menu = ['🥐 Випічка', '📍 Адреса', '☎️ Контакти', '🌾 Сайт'];
@Injectable()
export class BotInteractionsService {
  private readonly deliveries = new Map<number, Promise<void>>();
  private syncingReplyStatuses?: Promise<void>;
  private userBotId?: number;
  constructor(private readonly store: SupportRepository, private readonly commands: BotCommandsService, private readonly content: ContentService) {}
  private token(role: BotRole) {
    const token = process.env[role === 'user' ? 'TELEGRAM_USER_BOT_TOKEN' : 'TELEGRAM_ADMIN_BOT_TOKEN']?.trim();
    if (!token) throw new Error('Bot not configured');
    return token;
  }
  private admins() { return this.commands.adminIds(); }
  private async say(role: BotRole, chat: number | string, text: string, call: TelegramCall, extra: Record<string, unknown> = {}) {
    return call<{ message_id: number }>(this.token(role), 'sendMessage', { chat_id: chat, text, ...(role === 'admin' ? { disable_notification: true } : {}), link_preview_options: { is_disabled: true }, ...extra });
  }
  private async deliver(admin: number, call: TelegramCall) {
    const existing = this.deliveries.get(admin);
    if (existing) return existing;
    const work = this.deliverPending(admin, call).finally(() => this.deliveries.delete(admin));
    this.deliveries.set(admin, work);
    return work;
  }
  async retryDeliveries(call: TelegramCall) {
    await Promise.all((await this.admins()).map((admin) => this.deliver(admin, call)));
    await this.syncReplyStatuses(call);
  }
  private async syncReplyStatuses(call: TelegramCall) {
    if (this.syncingReplyStatuses) return this.syncingReplyStatuses;
    const work = this.notifyReplyStatuses(call).finally(() => { this.syncingReplyStatuses = undefined; });
    this.syncingReplyStatuses = work;
    return work;
  }
  private async notifyReplyStatuses(call: TelegramCall) {
    const admins = await this.admins();
    for (const status of await this.store.pendingReplyStatuses()) {
      if (!admins.includes(Number(status.admin_id))) continue;
      try {
        await call(this.token('admin'), 'editMessageReplyMarkup', {
          chat_id: status.admin_id, message_id: Number(status.message_id),
          reply_markup: { inline_keyboard: [[{ text: '✅ Вже відповіли · Відповісти ще', callback_data: `reply:${status.ticket_id}` }]] },
        });
      } catch { /* The notification below also works when Telegram cannot edit an old message. */ }
      try {
        if (receivesServiceNotifications(status.admin_id)) await this.say('admin', status.admin_id, `✅ На звернення №${status.ticket_id.slice(0, 8)} вже відповів адміністратор ${status.answered_by}. Відповідь доставлено відвідувачу.`, call,
          { reply_parameters: { message_id: Number(status.message_id), allow_sending_without_reply: true } });
        await this.store.replyStatusNotified(status.ticket_id, status.admin_id);
      } catch { /* Persisted status is retried by the polling loop. */ }
    }
  }
  private async deliverPending(admin: number, call: TelegramCall) {
    for (const ticket of await this.store.pending(admin)) {
      if (!(await this.admins()).includes(admin)) return;
      const text = `Нове звернення №${ticket.id.slice(0,8)}\nВід: ${ticket.sender_name}\n\n${ticket.message_text}`;
      let lastId = 0;
      try {
        for (let offset = 0; offset < text.length; offset += 3800) {
          const last = offset + 3800 >= text.length;
          const sent = await this.say('admin', admin, text.slice(offset, offset + 3800), call,
            { disable_notification: false, ...(last ? { reply_markup: { inline_keyboard: [[{ text: 'Відповісти', callback_data: `reply:${ticket.id}` }]] } } : {}) });
          lastId = sent.message_id;
        }
        await this.store.delivered(ticket.id, admin, lastId);
      } catch { /* Keep this administrator's delivery pending; retry when they send /start. */ }
    }
  }
  async callback(callback: BotCallback, call: TelegramCall) {
    const message = callback.message;
    if (!message || !await this.commands.isAdmin({ ...message, from: callback.from })) return;
    const confirmation = /^(confirm|discard):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(callback.data ?? '');
    if (confirmation && message.message_id) {
      await call(this.token('admin'), 'answerCallbackQuery', { callback_query_id: callback.id });
      const pending = await this.store.getConfirmation(confirmation[2], callback.from.id, message.message_id);
      if (!pending) { await this.say('admin', callback.from.id, 'Підтвердження вже недоступне або прострочене.', call); return; }
      if (confirmation[1] === 'discard') {
        await this.store.takeConfirmation(pending.id, callback.from.id);
        await this.say('admin', callback.from.id, 'Повторну відповідь скасовано.', call);
      } else {
        const ticket = await this.store.ticketById(pending.ticket_id);
        if (!ticket) return;
        await this.answer(callback.from.id, { message_id: Number(pending.source_message_id), text: pending.message_text, from: callback.from, chat: { id: callback.from.id, type: 'private' } }, ticket, call, pending.id);
      }
      return;
    }
    const match = /^reply:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(callback.data ?? '');
    if (!match || !message.message_id) return;
    const ticket = await this.store.ticketForButton(match[1], callback.from.id, message.message_id);
    await call(this.token('admin'), 'answerCallbackQuery', { callback_query_id: callback.id });
    if (!ticket) { await this.say('admin', callback.from.id, 'Це звернення вже недоступне.', call); return; }
    const prompt = await this.say('admin', callback.from.id, `Відповідь на звернення №${ticket.id.slice(0,8)} від ${ticket.sender_name}.\nНапишіть текст відповіді саме у відповідь на це повідомлення. /cancel — скасувати.`, call,
      { reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Ваша відповідь відвідувачу' } });
    await this.store.savePrompt(callback.from.id, prompt.message_id, ticket.id);
  }
  async catalogCallback(callback: BotCallback, call: TelegramCall) {
    const message = callback.message;
    if (!message?.message_id || message.chat.type !== 'private' || message.chat.id !== callback.from.id) return;
    if (!callback.data?.startsWith('catalog:')) return;
    await call(this.token('user'), 'answerCallbackQuery', { callback_query_id: callback.id });
    await call(this.token('user'), 'editMessageText', { chat_id: message.chat.id, message_id: message.message_id, text: 'Каталог тепер доступний на сайті пекарні. /site — відкрити сайт.', reply_markup: { inline_keyboard: [] } });
  }
  private async answer(admin: number, message: BotMessage, ticket: Ticket, call: TelegramCall, confirmationId?: string) {
    if (!message.message_id) return;
    if (!message.text) { await this.say('admin', admin, 'Надішліть текстову відповідь у відповідь на запит бота.', call); return; }
    let delivered = false;
    const locked = await this.store.withReplyLock(ticket.id, async store => {
      if (await store.replied(admin, message.message_id!)) return;
      if (confirmationId) { if (!await store.takeConfirmation(confirmationId, admin)) return; }
      else if (await store.hasReply(ticket.id)) {
        const pending = await store.saveConfirmation(admin, message.message_id!, ticket.id, message.text!);
        const previous = await store.latestReply(ticket.id);
        if (previous) {
          const author = previous.admin_name ? `${previous.admin_name} · ID ${previous.admin_id}` : `Telegram ID ${previous.admin_id}`;
          const context = `Остання відповідь на звернення №${ticket.id.slice(0,8)}\nАдміністратор: ${author}\n\n${previous.message_text ?? 'Текст давньої відповіді не збережено.'}`;
          for (let offset = 0; offset < context.length; offset += 3800) await this.say('admin', admin, context.slice(offset, offset + 3800), call);
        }
        const preview = message.text!.slice(0, 3000) + (message.text!.length > 3000 ? '\n… (показано початок вашої відповіді)' : '');
        const prompt = await this.say('admin', admin, `На звернення №${ticket.id.slice(0,8)} вже відповіли. Надіслати ще одну відповідь?\n\nВаша нова відповідь:\n${preview}`, call,
          { reply_markup: { inline_keyboard: [[{ text: 'Підтвердити', callback_data: `confirm:${pending.id}` }, { text: 'Скасувати', callback_data: `discard:${pending.id}` }]] } });
        await store.confirmationPrompt(pending.id, prompt.message_id); return;
      }
      const text = `Відповідь пекарні:\n\n${message.text}`;
      try {
        for (let offset = 0; offset < text.length; offset += 4000) {
          const sent = await this.say('user', ticket.user_id, text.slice(offset, offset + 4000), call,
            { reply_parameters: { message_id: Number(ticket.source_message_id), allow_sending_without_reply: true } });
          await store.saveVisitorAnswer(ticket.id, sent.message_id);
        }
      } catch { await this.say('admin', admin, 'Відповідь не доставлено. Можливо, відвідувач заблокував бота. Спробуйте пізніше.', call); return; }
      const adminName = [message.from?.first_name, message.from?.username ? `(@${message.from.username})` : ''].filter(Boolean).join(' ') || `Telegram ID ${admin}`;
      await store.markReplied(admin, message.message_id!, ticket.id, message.text!, adminName);
      await store.cancelPrompts(admin); delivered = true;
    });
    if (!locked) { await this.say('admin', admin, 'Інший адміністратор зараз відповідає на це звернення. Спробуйте ще раз.', call); return; }
    if (!delivered) return;
    await this.syncReplyStatuses(call);
    await this.say('admin', admin, 'Відповідь надіслано відвідувачу. Режим відповіді завершено. Щоб відповісти знову, натисніть «Відповісти» під зверненням.', call,
      { reply_markup: { remove_keyboard: true } });
  }
  private async isReplyToAdmin(message: BotMessage, call: TelegramCall) {
    const reply = message.reply_to_message;
    if (!reply) return false;
    if (await this.store.isVisitorReply(message.chat.id, reply.message_id)) return true;
    // Older answers were sent before their Telegram IDs were persisted.
    // Trust only Telegram's sender identity for this bot and its answer format.
    if (!reply.from?.is_bot || !reply.text?.startsWith('Відповідь пекарні:\n\n')) return false;
    this.userBotId ??= (await call<{ id: number }>(this.token('user'), 'getMe', {})).id;
    return reply.from.id === this.userBotId;
  }
  async message(role: BotRole, message: BotMessage, call: TelegramCall): Promise<boolean> {
    const input = message.text?.trim() ?? '';
    const command = input.split(/\s+/)[0].split('@')[0].toLowerCase();
    if (role === 'admin') {
      if (!await this.commands.isAdmin(message)) return true;
      if (command === '/cancel') { await this.store.cancelPrompts(message.chat.id); await this.say('admin', message.chat.id, 'Відповідь скасовано. Щоб відповісти, знову натисніть «Відповісти» під зверненням.', call); return true; }
      if (command === '/start') { await this.deliver(message.chat.id, call); return false; }
      if (message.reply_to_message && !command.startsWith('/')) {
        const ticket = await this.store.ticketForPrompt(message.chat.id, message.reply_to_message.message_id);
        if (ticket) await this.answer(message.chat.id, message, ticket, call);
        else await this.say('admin', message.chat.id, 'Натисніть «Відповісти» під потрібним зверненням: запит відповіді застарів або не знайдений.', call);
        return true;
      }
      return false;
    }
    if (message.chat.type !== 'private' || !message.from || message.from.id !== message.chat.id) return false;
    if (command === '/catalog' || command === '/address' || input === '🥐 Випічка' || input === '📍 Адреса') return false;
    if (command === '/support' || input === '💬 Зв’язатися') {
      await this.store.setMode(message.chat.id, true);
      await this.say('user', message.chat.id, 'Напишіть одне текстове повідомлення. Воно буде передане адміністраторам пекарні, а відповідь надійде сюди. Після надсилання режим зв’язку завершиться автоматично.\n/cancel — скасувати звернення.', call);
      return true;
    }
    if (command === '/cancel' || command === '/start') {
      await this.store.setMode(message.chat.id, false);
      if (command === '/cancel') { await this.say('user', message.chat.id, 'Режим зв’язку завершено. /support — звернутися знову.', call); return true; }
      return false;
    }
    if (command.startsWith('/') || menu.includes(input)) return false;
    const inSupport = await this.store.inMode(message.chat.id);
    const replyingToAdmin = !inSupport && await this.isReplyToAdmin(message, call);
    if (!inSupport && !replyingToAdmin) return false;
    if (!message.text || !message.message_id) { await this.say('user', message.chat.id, 'Поки що надішліть звернення текстом, будь ласка.', call); return true; }
    const admins = await this.admins();
    if (!admins.length || !process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim()) { await this.say('user', message.chat.id, 'Зв’язок із командою тимчасово недоступний. Спробуйте пізніше.', call); return true; }
    const name = `${message.from.first_name ?? 'Відвідувач'}${message.from.username ? ` (@${message.from.username})` : ''}`.slice(0, 160);
    let ticket: Ticket;
    try { ticket = await this.store.create(message.chat.id, message.message_id, name, message.text, admins); }
    catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 429) throw error;
      await this.say('user', message.chat.id, 'Забагато звернень. Спробуйте пізніше або зателефонуйте до пекарні: /contacts.', call);
      return true;
    }
    await this.store.setMode(message.chat.id, false);
    await Promise.all(admins.map((admin) => this.deliver(admin, call)));
    const delivered = await this.store.countDelivered(ticket.id);
    await this.say('user', message.chat.id, (delivered === admins.length ? 'Повідомлення передано адміністраторам. Відповідь надійде сюди.' : 'Звернення збережено. Адміністраторам, які ще не підключили бота, воно надійде після підключення. Відповідь очікуйте тут.') + '\nРежим зв’язку завершено. Щоб продовжити розмову, відповідайте на повідомлення пекарні через «Відповісти». /support — нове звернення.', call);
    return true;
  }
}
