import { MAX_QUANTITY_DIGITS } from './cart-limits.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import type { OpeningHours } from './opening-hours.js';
import { bakery, catalog } from './catalog.data.js';

export type Product = (typeof catalog)[number] & { visible?: boolean; price?: number; available?: boolean; availabilityMode?: 'poster' | 'manual' };
export type Bakery = Omit<typeof bakery, 'phone' | 'email' | 'instagram'> & { phone: string | null; email: string | null; instagram: string | null; openingHours?: OpeningHours; quantityDigits?: number };
export type Content = { products: Product[]; bakery: Bakery; demo: boolean };

function text(value: unknown, name: string, max: number, optional = false): string {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) throw new BadRequestException(`Некоректне поле: ${name}`);
  return value.trim();
}
function httpsUrl(value: string, name: string) {
  try { const url = new URL(value); if (url.protocol !== 'https:') throw new Error(); } catch { throw new BadRequestException(`Поле ${name} має містити HTTPS-посилання`); }
  return value;
}

@Injectable()
export class ContentService {
  constructor(private readonly database: DatabaseService) {}

  async get(): Promise<Content> {
    const result = await this.database.query<{ content: Content }>('SELECT content FROM bakery_site_content WHERE id = 1');
    if (!result.rows[0]) throw new Error('Run the content migration first');
    return result.rows[0].content;
  }

  private async mutate(change: (content: Content) => void) {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ content: Content }>('SELECT content FROM bakery_site_content WHERE id = 1 FOR UPDATE');
      if (!result.rows[0]) throw new Error('Run the content migration first');
      const content = result.rows[0].content;
      change(content);
      await client.query('UPDATE bakery_site_content SET content = $1::jsonb, updated_at = now() WHERE id = 1', [JSON.stringify(content)]);
      return content;
    });
  }

  validateProduct(body: Record<string, unknown>, id: string): Product {
    if (!body || typeof body !== 'object') throw new BadRequestException('Очікується товар');
    const category = text(body.category, 'category', 20);
    const labels: Record<string, string> = { bread: 'Хліб', pastry: 'Солона та листкова випічка', sweet: 'До чаю' };
    if (!labels[category]) throw new BadRequestException('Невідома категорія');
    const image = text(body.image, 'image', 500);
    if (!/^\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(image)) httpsUrl(image, 'image');
    if (typeof body.visible !== 'boolean') throw new BadRequestException('Некоректне поле visible');
    if (body.available !== undefined && typeof body.available !== 'boolean') throw new BadRequestException('Некоректне поле available');
    if (body.availabilityMode !== undefined && body.availabilityMode !== 'poster' && body.availabilityMode !== 'manual') throw new BadRequestException('Некоректний режим наявності');
    const price = body.price == null || body.price === '' ? undefined : Number(body.price);
    if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 100000)) throw new BadRequestException('Некоректна ціна');
    return { id, price, name: text(body.name, 'name', 120), category, categoryLabel: labels[category], image,
      description: text(body.description, 'description', 1500, true), ingredients: text(body.ingredients, 'ingredients', 1500, true),
      allergens: text(body.allergens, 'allergens', 500, true), tag: text(body.tag, 'tag', 80, true), visible: body.visible, available: body.available !== false, ...(body.availabilityMode ? { availabilityMode: body.availabilityMode as 'poster' | 'manual' } : {}) };
  }

  async saveProduct(id: string | undefined, body: Record<string, unknown>) {
    const product = this.validateProduct(body, id ?? randomUUID());
    await this.mutate((content) => {
      const index = content.products.findIndex((entry) => entry.id === product.id);
      if (id && index < 0) throw new NotFoundException('Товар не знайдено');
      if (index < 0) {
        if (content.products.length >= 1000) throw new BadRequestException('Максимум 1000 товарів');
        content.products.push(product);
      } else {
        if (!product.availabilityMode && content.products[index].availabilityMode) product.availabilityMode = content.products[index].availabilityMode;
        content.products[index] = product;
      }
    });
    return product;
  }

  async removeProduct(id: string) {
    await this.mutate((content) => {
      if (!content.products.some((product) => product.id === id)) throw new NotFoundException('Товар не знайдено');
      content.products = content.products.filter((product) => product.id !== id);
    });
    return { ok: true };
  }

  async setVisibility(id: string, visible: boolean) {
    await this.mutate((content) => {
      const product = content.products.find((entry) => entry.id === id);
      if (!product) throw new NotFoundException('Товар не знайдено');
      product.visible = visible;
    });
  }

  async saveBakery(body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') throw new BadRequestException('Очікуються контактні дані');
    const contact = (key: string, max: number) => body[key] == null || body[key] === '' ? null : text(body[key], key, max);
    const phone = contact('phone', 40);
    if (phone && !/^\+?[\d ()-]{7,40}$/.test(phone)) throw new BadRequestException('Некоректний телефон');
    const email = contact('email', 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Некоректна пошта');
    const instagram = contact('instagram', 300);
    if (instagram) { httpsUrl(instagram, 'instagram'); if (!['instagram.com', 'www.instagram.com'].includes(new URL(instagram).hostname)) throw new BadRequestException('Потрібне посилання Instagram'); }
    const quantityDigits = body.quantityDigits;
    if (quantityDigits !== undefined && (typeof quantityDigits !== 'number' || !Number.isInteger(quantityDigits) || quantityDigits < 1 || quantityDigits > MAX_QUANTITY_DIGITS)) throw new BadRequestException('Ліміт кількості: від 1 до 4 цифр');
    const hours = body.openingHours;
    if (hours !== undefined && (!Array.isArray(hours) || hours.length !== 7 || !hours.every(day => day === null || (typeof day === 'object' && typeof day.open === 'string' && typeof day.close === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.open) && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.close) && day.open !== day.close)))) throw new BadRequestException('Некоректний графік роботи');
    const updated = await this.mutate((content) => {
      for (const [key, limit] of [['latitude', 90], ['longitude', 180]] as const) {
        if (body[key] !== undefined) {
          if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || Math.abs(body[key]) > limit) throw new BadRequestException(`Некоректні координати: ${key}`);
          content.bakery[key] = body[key];
        }
      }
      content.bakery = { ...content.bakery, city: text(body.city, 'city', 100), address: text(body.address, 'address', 200),
        fullAddress: text(body.fullAddress, 'fullAddress', 400), mapsUrl: httpsUrl(text(body.mapsUrl, 'mapsUrl', 700), 'mapsUrl'), phone, email, instagram, ...(quantityDigits !== undefined ? { quantityDigits } : {}), ...(hours !== undefined ? { openingHours: hours as OpeningHours } : {}) };
    });
    return updated.bakery;
  }

  async setContact(field: string, value: string) {
    if (!['phone', 'email', 'instagram'].includes(field)) throw new BadRequestException('Доступні phone, email, instagram');
    const current = await this.get();
    return this.saveBakery({ ...current.bakery, [field]: value === '-' ? null : value });
  }
}
