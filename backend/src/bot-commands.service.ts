import { Injectable, Optional } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { isOwner, OWNER_IDS, TelegramAdminsService } from './telegram-admins.service.js';

export type BotRole = 'user' | 'admin';
export type BotMessage = { message_id?: number; text?: string; reply_to_message?: { message_id: number; text?: string; from?: { id: number; is_bot?: boolean } }; from?: { id: number; first_name?: string; username?: string }; chat: { id: number; type: string } };

@Injectable()
export class BotCommandsService {
  constructor(private readonly content: ContentService, @Optional() private readonly admins?: TelegramAdminsService) {}
  async adminIds(): Promise<number[]> { return this.admins ? this.admins.ids() : [...OWNER_IDS]; }
  async isAdmin(message: BotMessage) {
    if (message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id || !Number.isSafeInteger(message.from.id) || message.from.id <= 0) return false;
    return this.admins ? this.admins.has(message.from.id) : isOwner(message.from.id);
  }
  async handle(role: BotRole, message: BotMessage): Promise<string | null> {
    if (role === 'admin' && !await this.isAdmin(message)) return null;
    if (message.chat.type !== 'private') return 'Будь ласка, напишіть боту в особисті повідомлення.';
    const input = (message.text ?? '/help').trim();
    const [raw, ...args] = input.split(/\s+/);
    const command = raw.split('@')[0].toLowerCase();
    const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000';
    if (role === 'admin') {
      if (command === '/addadmin' || command === '/removeadmin' || command === '/admins') {
        if (!isOwner(message.from!.id)) return 'Керувати адміністраторами можуть лише власники.';
        if (command === '/admins') return `Власники: ${OWNER_IDS.join(', ')}\nАдміністратори: ${(await this.adminIds()).filter(id => !isOwner(id)).join(', ') || 'ще не додані'}`;
        if (args.length !== 1) return `Використання: ${command} TELEGRAM_ID`;
        if (!this.admins) return 'Керування адміністраторами тимчасово недоступне.';
        try { await this.admins.change(message.from!.id, args[0], command === '/addadmin'); }
        catch (error) { if (error instanceof Error && 'getStatus' in error) return error.message; throw error; }
        return command === '/addadmin' ? 'Адміністратора додано без права керувати іншими. Йому потрібно відкрити цей бот і надіслати /start.' : 'Доступ адміністратора відкликано.';
      }
      if (command === '/hide' || command === '/show') {
        if (!args[0]) return `Використання: ${command} ID_товару`;
        await this.content.setVisibility(args[0], command === '/show');
        return command === '/show' ? 'Товар показано у вітрині.' : 'Товар приховано з вітрини.';
      }
      if (command === '/contact') {
        if (args.length < 2) return 'Використання: /contact phone|email|instagram значення\nЩоб очистити поле, використайте -';
        await this.content.setContact(args[0], args.slice(1).join(' '));
        return 'Контакт збережено на сайті.';
      }
      if (command === '/panel') return `Панель адміністратора: ${site}/admin`;
      if (command === '/products' || command === '/status') {
        const state = await this.content.get();
        if (command === '/status') return `Хлібне ремесло\nТоварів: ${state.products.length}\nУ вітрині: ${state.products.filter((product) => product.visible !== false).length}\nПанель: ${site}/admin`;
        return state.products.map((product) => `${product.visible === false ? 'Приховано' : 'У вітрині'} · ${product.name}\nID: ${product.id}`).join('\n\n').slice(0, 3900) || 'Каталог порожній.';
      }
      return 'Панель пекарні\n/status — стан каталогу\n/products — товари та ID\n/hide ID — приховати товар\n/show ID — показати товар\n/contact phone|email|instagram значення — змінити контакт\n/panel — адмін-панель сайту' + (isOwner(message.from!.id) ? '\n/admins — список адміністраторів\n/addadmin ID — додати адміністратора\n/removeadmin ID — відкликати доступ' : '');
    }
    if (command === '/catalog' || input === '🥐 Випічка') {
      return `Каталог доступний на сайті пекарні: ${site}/#catalog`;
    }
    if (command === '/address' || input === '📍 Адреса') return `Адреса пекарні є на сайті: ${site}/#location`;
    if (command === '/contacts' || input === '☎️ Контакти') {
      const { bakery } = await this.content.get();
      const contacts = [bakery.phone && `☎️ Телефон: ${bakery.phone}`, bakery.email && `Пошта: ${bakery.email}`, bakery.instagram && `Instagram: ${bakery.instagram}`].filter(Boolean).join('\n') || 'Контакти додамо згодом. Чекаємо на вас у пекарні!';
      return `${contacts}\n\n💬 Або напишіть нам тут: /support`;
    }
    if (command === '/site' || input === '🌾 Сайт') return `Наша вітрина: ${site}`;
    return 'Вітаємо у «Хлібному ремеслі»! 🌾\n/contacts — контакти\n/support — написати адміністраторам\n/site — сайт пекарні';
  }
}
