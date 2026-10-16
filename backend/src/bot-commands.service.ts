import { Injectable } from '@nestjs/common';
import { ContentService } from './content.service.js';

export type BotRole = 'user' | 'admin';
export type BotMessage = { message_id?: number; text?: string; reply_to_message?: { message_id: number }; from?: { id: number; first_name?: string; username?: string }; chat: { id: number; type: string } };

@Injectable()
export class BotCommandsService {
  constructor(private readonly content: ContentService) {}
  isAdmin(message: BotMessage) {
    const allowed = new Set((process.env.TELEGRAM_ADMIN_IDS ?? '470334534,5711475783').split(',').map((value) => value.trim()).filter(Boolean));
    return message.chat.type === 'private' && !!message.from && message.chat.id === message.from.id && allowed.has(String(message.from.id));
  }
  async handle(role: BotRole, message: BotMessage): Promise<string | null> {
    if (role === 'admin' && !this.isAdmin(message)) return null;
    if (message.chat.type !== 'private') return 'Будь ласка, напишіть боту в особисті повідомлення.';
    const input = (message.text ?? '/help').trim();
    const [raw, ...args] = input.split(/\s+/);
    const command = raw.split('@')[0].toLowerCase();
    const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000';
    if (role === 'admin') {
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
      return 'Панель пекарні\n/status — стан каталогу\n/products — товари та ID\n/hide ID — приховати товар\n/show ID — показати товар\n/contact phone|email|instagram значення — змінити контакт\n/panel — адмін-панель сайту';
    }
    if (command === '/catalog' || input === '🥐 Випічка') {
      const state = await this.content.get();
      const lines = state.products.filter((product) => product.visible !== false).map((product) => `• ${product.name}\n${product.description}`);
      return `${state.demo ? 'Приклади нашої майбутньої вітрини:\n\n' : 'Наша вітрина:\n\n'}${lines.join('\n\n') || 'Каталог скоро оновиться.'}\n\nЗавітайте до пекарні — онлайн-замовлень немає.`.slice(0, 3900);
    }
    if (command === '/address' || input === '📍 Адреса') { const { bakery } = await this.content.get(); return `${bakery.name}\n${bakery.fullAddress}\n${bakery.mapsUrl}`; }
    if (command === '/contacts' || input === '☎️ Контакти') {
      const { bakery } = await this.content.get();
      const contacts = [bakery.phone && `☎️ Телефон: ${bakery.phone}`, bakery.email && `Пошта: ${bakery.email}`, bakery.instagram && `Instagram: ${bakery.instagram}`].filter(Boolean).join('\n') || 'Контакти додамо згодом. Чекаємо на вас у пекарні!';
      return `${contacts}\n\n💬 Або напишіть нам тут: /support`;
    }
    if (command === '/site' || input === '🌾 Сайт') return `Наша вітрина: ${site}`;
    return 'Вітаємо у «Хлібному ремеслі»! 🌾\n/catalog — випічка\n/address — де ми знаходимося\n/contacts — контакти\n/support — написати адміністраторам\n/cancel — завершити спілкування\n/site — сайт пекарні';
  }
}
