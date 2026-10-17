import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import type { Content, Product } from './content.service.js';

type MenuItem = { product_id: string; ingredient_id?: string };
type Stock = { ingredient_id: string; ingredients_type: string; ingredient_left?: string; storage_ingredient_left?: string };
export function posterAvailability(products: Product[], menu: MenuItem[], stocks: Stock[], storageSpecific = false) {
  const summary = { matched: 0, changed: 0, available: 0, unavailable: 0, manual: 0, untracked: 0 };
  const updated = products.map(product => {
    const id = /^poster-(?:dish|product)-(\d+)$/.exec(product.id)?.[1];
    if (!id || product.availabilityMode === 'manual') { summary.manual++; return product; }
    const candidates = menu.filter(item => String(item.product_id) === id);
    if (candidates.length > 1) throw new Error('Ambiguous Poster product');
    const ingredient = candidates[0]?.ingredient_id;
    if (!ingredient || String(ingredient) === '0') { summary.untracked++; return product; }
    const balances = stocks.filter(stock => String(stock.ingredient_id) === String(ingredient) && ['2', '4'].includes(String(stock.ingredients_type)));
    if (!balances.length) { summary.untracked++; return product; }
    if (balances.length !== 1) throw new Error('Ambiguous Poster balance');
    const raw = storageSpecific ? balances[0].storage_ingredient_left : balances[0].ingredient_left;
    if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error('Invalid Poster balance');
    const available = Number(raw) > 0;
    summary.matched++; summary[available ? 'available' : 'unavailable']++;
    if ((product.available !== false) === available) return product;
    summary.changed++;
    return { ...product, available };
  });
  return { products: updated, summary };
}

@Injectable()
export class PosterService {
  constructor(private readonly db: DatabaseService) {}
  async status() {
    const row = (await this.db.query('SELECT last_attempt_at AS "lastAttemptAt",last_success_at AS "lastSuccessAt",last_error AS "lastError",summary FROM bakery_poster_sync WHERE id=1')).rows[0];
    return { configured: !!process.env.POSTER_API_TOKEN?.trim(), storage: process.env.POSTER_STORAGE_ID?.trim() || null, ...row };
  }
  private async read(method: 'menu.getProducts' | 'storage.getStorageLeftovers') {
    const url = new URL(`https://joinposter.com/api/${method}`);
    url.searchParams.set('token', process.env.POSTER_API_TOKEN!.trim());
    if (method === 'storage.getStorageLeftovers') {
      url.searchParams.set('zero_leftovers', 'true');
      const storage = process.env.POSTER_STORAGE_ID?.trim();
      if (storage) { if (!/^\d+$/.test(storage)) throw new Error('Invalid storage'); url.searchParams.set('storage_id', storage); }
    }
    // Fixed allowlist and GET only: this integration cannot write to Poster.
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000), redirect: 'error' });
    const payload = await response.json() as { response?: unknown; error?: unknown };
    if (!response.ok || payload.error || !Array.isArray(payload.response) || !payload.response.length) throw new Error('Poster read failed');
    return payload.response;
  }
  async sync() {
    if (!process.env.POSTER_API_TOKEN?.trim()) throw new ServiceUnavailableException('API-ключ Poster не налаштований.');
    try {
      return await this.db.transaction(async client => {
        const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('bakery-poster-sync')) AS locked");
        if (!lock.rows[0].locked) throw new ConflictException('Синхронізація вже триває.');
        const [menu, stocks] = await Promise.all([this.read('menu.getProducts'), this.read('storage.getStorageLeftovers')]);
        if (!menu.every(item => item && typeof item === 'object' && 'product_id' in item) || !stocks.every(item => item && typeof item === 'object' && 'ingredient_id' in item)) throw new Error('Invalid response');
        const result = await client.query<{ content: Content }>('SELECT content FROM bakery_site_content WHERE id=1 FOR UPDATE');
        if (!result.rows[0]) throw new Error('Missing catalogue');
        const content = result.rows[0].content;
        const planned = posterAvailability(content.products, menu as MenuItem[], stocks as Stock[], !!process.env.POSTER_STORAGE_ID?.trim());
        if (!planned.summary.matched) throw new Error('No matching balances');
        if (planned.summary.changed) await client.query('UPDATE bakery_site_content SET content=$1::jsonb,updated_at=now() WHERE id=1', [JSON.stringify({ ...content, products: planned.products })]);
        await client.query('UPDATE bakery_poster_sync SET last_attempt_at=now(),last_success_at=now(),last_error=NULL,summary=$1::jsonb WHERE id=1', [JSON.stringify(planned.summary)]);
        return planned.summary;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Do not persist remote error bodies or token-bearing request URLs.
      await this.db.query("UPDATE bakery_poster_sync SET last_attempt_at=now(),last_error='Не вдалося прочитати залишки Poster. Попередню наявність збережено.' WHERE id=1").catch(() => {});
      throw new ServiceUnavailableException('Не вдалося прочитати залишки Poster. Попередню наявність збережено.');
    }
  }
}
