import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { BotCommandsService } from './bot-commands.service.js';
import type { BotMessage, BotRole } from './bot-commands.service.js';
import { BotInteractionsService } from './bot-interactions.service.js';
import type { BotCallback } from './bot-interactions.service.js';

export type Update = { update_id: number; message?: BotMessage; callback_query?: BotCallback };
@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private readonly abort = new AbortController();
  private readonly states: Record<BotRole, string> = { user: 'disabled', admin: 'disabled' };
  private readonly tasks: Promise<void>[] = [];
  constructor(private readonly commands: BotCommandsService, private readonly interactions: BotInteractionsService) {}

  status() { return { ...this.states }; }
  onModuleInit() {
    const tokens = { user: process.env.TELEGRAM_USER_BOT_TOKEN?.trim(), admin: process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim() };
    if (tokens.user && tokens.admin && tokens.user === tokens.admin) { this.states.user = this.states.admin = 'duplicate_tokens'; this.logger.error('Use different tokens for the two bots'); return; }
    for (const role of ['user', 'admin'] as const) {
      const token = tokens[role];
      if (token && (process.env.VERCEL || process.env.TELEGRAM_MODE === 'webhook')) this.states[role] = 'webhook';
      else if (token) { this.states[role] = 'starting'; this.tasks.push(this.run(role, token)); }
      else this.logger.log(`${role} bot disabled: token not configured`);
    }
  }
  private async call<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
    // Never include token-bearing URLs or Telegram response descriptions in logs.
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(35000)]),
    });
    const data = await response.json() as { ok: boolean; result: T; error_code?: number };
    if (!data.ok) { const error = new Error('Telegram API failed') as Error & { code: number }; error.code = data.error_code ?? response.status; throw error; }
    return data.result;
  }
  async handleUpdate(role: BotRole, update: Update) {
    const token = process.env[role === 'user' ? 'TELEGRAM_USER_BOT_TOKEN' : 'TELEGRAM_ADMIN_BOT_TOKEN']?.trim();
    if (!token || this.states[role] === 'duplicate_tokens') throw new Error('Bot not configured');
    if (update.callback_query) {
      if (role === 'admin') await this.interactions.callback(update.callback_query, this.call.bind(this));
      else await this.interactions.catalogCallback(update.callback_query, this.call.bind(this));
    }
    if (update.message) {
      const handled = await this.interactions.message(role, update.message, this.call.bind(this));
      const text = handled ? null : await this.commands.handle(role, update.message);
      if (text !== null) {
        try {
          await this.call(token, 'sendMessage', { chat_id: update.message.chat.id, text, link_preview_options: { is_disabled: true },
            ...(role === 'user' && update.message.chat.type === 'private' ? { reply_markup: { keyboard: [['☎️ Контакти', '🌾 Сайт'], ['💬 Зв’язатися']], resize_keyboard: true } } : {}) });
        } catch (error) { if ((error as { code?: number }).code !== 403) throw error; }
      }
    }
    await this.retryDeliveries();
  }
  async retryDeliveries() { await this.interactions.retryDeliveries(this.call.bind(this)); }
  private delay(ms: number) {
    return new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); this.abort.signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, ms);
      this.abort.signal.addEventListener('abort', finish, { once: true });
      if (this.abort.signal.aborted) finish();
    });
  }
  private async run(role: BotRole, token: string) {
    let offset = 0;
    let failures = 0;
    let initialized = false;
    while (!this.abort.signal.aborted) {
      try {
        if (!initialized) {
          await this.call(token, 'getMe', {});
          const webhook = await this.call<{ url: string }>(token, 'getWebhookInfo', {});
          if (webhook.url) { this.states[role] = 'webhook_configured'; this.logger.warn(`${role} bot has an existing webhook; polling not started`); return; }
          initialized = true;
        }
        this.states[role] = 'running';
        const updates = await this.call<Update[]>(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        for (const update of updates) {
          if (update.callback_query && !this.abort.signal.aborted) {
            try {
              if (role === 'admin') await this.interactions.callback(update.callback_query, this.call.bind(this));
              else await this.interactions.catalogCallback(update.callback_query, this.call.bind(this));
            }
            catch { this.logger.warn('Could not process reply button'); }
          }
          if (update.message && !this.abort.signal.aborted) {
            let text: string | null;
            try {
              const handled = await this.interactions.message(role, update.message, this.call.bind(this));
              text = handled ? null : await this.commands.handle(role, update.message);
            }
            catch { text = 'Не вдалося виконати дію. Перевірте команду та спробуйте пізніше.'; }
            if (text !== null) try {
              await this.call(token, 'sendMessage', { chat_id: update.message.chat.id, text, link_preview_options: { is_disabled: true },
                ...(role === 'user' && update.message.chat.type === 'private' ? { reply_markup: { keyboard: [['☎️ Контакти', '🌾 Сайт'], ['💬 Зв’язатися']], resize_keyboard: true } } : {}) });
            } catch (error) {
              // A visitor blocking the bot must not stall every other chat.
              if ((error as { code?: number }).code !== 403) throw error;
            }
          }
          offset = update.update_id + 1;
        }
        if (role === 'admin' && !this.abort.signal.aborted) await this.interactions.retryDeliveries(this.call.bind(this));
        failures = 0;
      } catch (error) {
        if (this.abort.signal.aborted) break;
        const code = (error as { code?: number }).code;
        if (code === 401 || code === 409) { this.states[role] = code === 401 ? 'invalid_token' : 'polling_conflict'; this.logger.error(`${role} bot stopped (${this.states[role]})`); return; }
        this.states[role] = 'retrying';
        this.logger.warn(`${role} bot connection failed; retry scheduled`);
        await this.delay(Math.min(60000, 1000 * 2 ** Math.min(failures++, 6)));
      }
    }
    this.states[role] = 'stopped';
  }
  async onApplicationShutdown() { this.abort.abort(); await Promise.allSettled(this.tasks); }
}
