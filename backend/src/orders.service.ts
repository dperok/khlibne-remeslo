import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import type { Content } from './content.service.js';

export type OrderItem = { id: string; name: string; quantity: number; unitKopecks: number };
export type Order = { id: string; number: string; customerName: string; phone: string; items: OrderItem[]; totalKopecks: number; pickupAddress: string; status: string; paymentStatus: 'unpaid'; createdAt: string; updatedAt: string };
type StoredOrder = Order & { tokenHash: string; requestHash: string };
const columns = `id, number::text, customer_name AS "customerName", phone, items, total_kopecks AS "totalKopecks", pickup_address AS "pickupAddress", status, payment_status AS "paymentStatus", created_at AS "createdAt", updated_at AS "updatedAt"`;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function tokenHash(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException('Замовлення не знайдено');
  return digest(token);
}
export function validateOrder(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || typeof body.id !== 'string' || !uuid.test(body.id)) throw new BadRequestException('Некоректне замовлення');
  const hash = tokenHash(body.token);
  if (typeof body.customerName !== 'string' || !body.customerName.trim() || body.customerName.length > 80) throw new BadRequestException('Вкажіть ім’я');
  if (typeof body.phone !== 'string' || !/^[+\d ()-]{10,24}$/.test(body.phone)) throw new BadRequestException('Вкажіть номер телефону');
  let phone = body.phone.replace(/\D/g, '');
  if (/^0\d{9}$/.test(phone)) phone = `38${phone}`;
  if (!/^[1-9]\d{9,14}$/.test(phone)) throw new BadRequestException('Некоректний номер телефону');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new BadRequestException('У кошику має бути від 1 до 50 позицій');
  const ids = new Set<string>();
  const items = body.items.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new BadRequestException('Некоректний товар');
    const { id, quantity } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id.length > 100 || !id || ids.has(id) || !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99) throw new BadRequestException('Некоректна кількість товару');
    ids.add(id); return { id, quantity: quantity as number };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const request = { customerName: body.customerName.trim(), phone: `+${phone}`, items };
  return { ...request, id: body.id, tokenHash: hash, requestHash: digest(JSON.stringify(request)) };
}
export function priceOrder(items: { id: string; quantity: number }[], content: Content) {
  const lines: OrderItem[] = items.map(item => {
    const product = content.products.find(p => p.id === item.id && p.visible !== false);
    if (!product || product.available === false || typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0) throw new ConflictException(`Товар недоступний: ${product?.name ?? item.id}. Оновіть вітрину.`);
    return { ...item, name: product.name, unitKopecks: Math.round(product.price * 100) };
  });
  const totalKopecks = lines.reduce((sum, item) => sum + item.unitKopecks * item.quantity, 0);
  if (!Number.isSafeInteger(totalKopecks) || totalKopecks > 100000000) throw new BadRequestException('Завелика сума замовлення');
  return { lines, totalKopecks };
}
@Injectable()
export class OrdersService {
  constructor(private readonly db: DatabaseService) {}
  async create(body: Record<string, unknown>) {
    const input = validateOrder(body);
    return this.db.transaction(async client => {
      // Serialize retries across serverless instances before reading/inserting the order.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order:${input.id}`]);
      const existing = await client.query<StoredOrder>(`SELECT ${columns}, token_hash AS "tokenHash", request_hash AS "requestHash" FROM bakery_orders WHERE id=$1`, [input.id]);
      if (existing.rows[0]) {
        const { tokenHash: savedToken, requestHash, ...order } = existing.rows[0];
        if (savedToken !== input.tokenHash || requestHash !== input.requestHash) throw new ConflictException('Повторний запит відрізняється від замовлення');
        return order;
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order-phone:${input.phone}`]);
      const recent = await client.query<{ count: string }>("SELECT count(*)::text FROM bakery_orders WHERE phone=$1 AND created_at > now()-interval '1 hour'", [input.phone]);
      if (Number(recent.rows[0].count) >= 10) throw new HttpException('Забагато замовлень. Спробуйте пізніше.', 429);
      const state = await client.query<{ content: Content }>('SELECT content FROM bakery_site_content WHERE id=1 FOR SHARE');
      if (!state.rows[0]) throw new ConflictException('Вітрина тимчасово недоступна');
      const content = state.rows[0].content;
      const { lines, totalKopecks } = priceOrder(input.items, content);
      const result = await client.query<Order>(`INSERT INTO bakery_orders (id, customer_name, phone, items, total_kopecks, pickup_address, token_hash, request_hash) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING ${columns}`, [input.id, input.customerName, input.phone, JSON.stringify(lines), totalKopecks, content.bakery.fullAddress, input.tokenHash, input.requestHash]);
      return result.rows[0];
    });
  }
  async customerOrder(id: string, token: unknown, cancel = false) {
    if (!uuid.test(id)) throw new NotFoundException('Замовлення не знайдено');
    const hash = tokenHash(token);
    return this.db.transaction(async client => {
      const result = await client.query<Order>(`SELECT ${columns} FROM bakery_orders WHERE id=$1 AND token_hash=$2 FOR UPDATE`, [id, hash]);
      const order = result.rows[0];
      if (!order) throw new NotFoundException('Замовлення не знайдено');
      if (!cancel || order.status === 'cancelled') return order;
      if (order.status === 'completed') throw new ConflictException('Виконане замовлення вже не можна скасувати');
      return (await client.query<Order>(`UPDATE bakery_orders SET status='cancelled', updated_at=now() WHERE id=$1 RETURNING ${columns}`, [id])).rows[0];
    });
  }
  async list() {
    return (await this.db.query<Order>(`SELECT ${columns} FROM bakery_orders WHERE status <> 'cancelled' ORDER BY created_at DESC LIMIT 200`)).rows;
  }
  async update(id: string, status: unknown) {
    if (!uuid.test(id) || !['new','preparing','ready','completed','cancelled'].includes(status as string)) throw new BadRequestException('Некоректний статус');
    const result = await this.db.query<Order>(`UPDATE bakery_orders SET status=$2, updated_at=now() WHERE id=$1 AND status NOT IN ('cancelled','completed') RETURNING ${columns}`, [id, status]);
    if (!result.rows[0]) throw new ConflictException('Замовлення вже завершено або скасовано. Оновіть список.');
    return result.rows[0];
  }
}
