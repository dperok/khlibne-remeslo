import { posterAvailability, PosterService } from './poster.service.js';
import { PosterController } from './poster.controller.js';
import type { Product } from './content.service.js';
import type { DatabaseService } from './database.service.js';

const product = (id = 'poster-product-35', available = true): Product => ({ id, name: 'Кекс', available, price: 17 } as Product);
const menu = [{ product_id: '35', ingredient_id: '144' }];
const stock = (quantity: string) => [{ ingredient_id: '144', ingredients_type: '2', ingredient_left: quantity }];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Poster stock sync', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const history = (quantity: number, changed: string | null = null) => new Map([['all:144:2', { stockKey: 'all:144:2', quantity, firstObservedAt: '2026-10-15T12:00:00Z', lastChangedAt: changed }]]);
  it.each(['0.0000000', '-3.25', '8'])('marks unchanged stock %s unavailable after 24 hours regardless of sign', quantity => {
    const p = product(); const result = posterAvailability([p], menu, stock(quantity), false, history(Number(quantity)), now);
    expect(result.products[0]).toEqual({ ...p, available: false }); expect(p.available).toBe(true);
    expect(result.summary).toMatchObject({ matched: 1, changed: 1, unavailable: 1 });
  });
  it.each([[-3, '-4'], [-4, '-3'], [2, '0'], [0, '2']])('marks any observed change from %s to %s available', (previous, current) => {
    const result = posterAvailability([product(undefined, false)], menu, stock(current), false, history(previous), now);
    expect(result.products[0].available).toBe(true);
    expect(result.observations[0].lastChangedAt).toBe(now.toISOString());
  });
  it('preserves initial availability during baseline collection without inventing a change', () => {
    for (const available of [true, false]) {
      const result = posterAvailability([product(undefined, available)], menu, stock('-3'), false, new Map(), now);
      expect(result.products[0].available).toBe(available);
      expect(result.observations[0].lastChangedAt).toBeNull(); expect(result.summary.learning).toBe(1);
    }
  });
  it('expires at the exact 24-hour boundary and does not renew an unchanged quantity', () => {
    const changed = '2026-10-16T12:00:00Z';
    expect(posterAvailability([product()], menu, stock('8'), false, history(8, changed), now).products[0].available).toBe(false);
    const recent = posterAvailability([product(undefined, false)], menu, stock('-4'), false, history(-4, '2026-10-17T11:00:00Z'), now);
    expect(recent.products[0].available).toBe(true); expect(recent.observations[0].lastChangedAt).toBe('2026-10-17T11:00:00Z');
  });
  it('respects manual overrides and products outside Poster', () => {
    const products = [{ ...product(), availabilityMode: 'manual' as const }, product('custom')];
    expect(posterAvailability(products, menu, stock('-2'))).toMatchObject({ products, summary: { manual: 2, matched: 0 } });
  });
  it('preserves untracked recipes and missing stock instead of guessing zero', () => {
    const products = [product('poster-dish-55'), product()];
    expect(posterAvailability(products, [...menu, { product_id: '55', ingredient_id: '0' }], []).products).toEqual(products);
  });
  it('does not confuse ingredient stocks with finished goods', () => {
    expect(posterAvailability([product()], menu, [{ ...stock('-3')[0], ingredients_type: '1' }]).summary.untracked).toBe(1);
  });
  it('uses the selected warehouse balance', () => {
    expect(posterAvailability([product(undefined, false)], menu, [{ ...stock('8')[0], storage_ingredient_left: '0' }], true, history(8), now).products[0].available).toBe(true);
  });
  it('rejects malformed and ambiguous balances without a partial update', () => {
    expect(() => posterAvailability([product()], menu, stock('oops'))).toThrow();
    expect(() => posterAvailability([product()], menu, [...stock('3'), ...stock('-4')])).toThrow();
  });
  it('performs GET reads only and preserves catalogue on API failure without leaking the token', async () => {
    vi.stubEnv('POSTER_API_TOKEN', 'private-test-key');
    const query = vi.fn(async () => ({ rows: [{ locked: true }] }));
    const db = { transaction: async (work: (client: { query: typeof query }) => unknown) => work({ query }), query: vi.fn(async () => ({})) } as unknown as DatabaseService;
    const fetcher = vi.fn(async () => { throw new Error('private-test-key'); }); vi.stubGlobal('fetch', fetcher);
    await expect(new PosterService(db).sync()).rejects.toThrow('Попередню наявність збережено');
    for (const [url, options] of fetcher.mock.calls as unknown as [URL, RequestInit][]) {
      expect(url.hostname).toBe('joinposter.com'); expect(options.method).toBe('GET');
      if (url.pathname.includes('Leftovers')) expect(url.searchParams.get('zero_leftovers')).toBe('true');
    }
    expect(query.mock.calls).toHaveLength(1);
    expect(JSON.stringify(vi.mocked(db.query).mock.calls)).not.toContain('private-test-key');
  });
  it('requires the cron secret before accessing Poster', () => {
    vi.stubEnv('CRON_SECRET', 'cron-key'); const sync = vi.fn();
    const controller = new PosterController({ sync } as unknown as PosterService);
    expect(() => controller.sync()).toThrow(); expect(() => controller.sync('Bearer wrong')).toThrow();
    expect(sync).not.toHaveBeenCalled(); controller.sync('Bearer cron-key'); expect(sync).toHaveBeenCalledOnce();
  });
});

describe('Poster failure notifications', () => {
  it('notifies each administrator once and does not send secrets', async () => {
    vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', 'test-admin-token'); vi.stubEnv('TELEGRAM_ADMIN_IDS', '470334534,5711475783,470334534');
    const claimed = new Set();
    const db = { query: vi.fn(async (_sql, [id]) => { if (claimed.has(id)) return { rows: [] }; claimed.add(id); return { rows: [{ last_sent_at: new Date() }] }; }) } as unknown as DatabaseService;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }))); vi.stubGlobal('fetch', fetcher);
    const service = new PosterService(db); await service.notifyFailure(); await service.notifyFailure();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(call => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).chat_id).sort()).toEqual(['470334534', '5711475783']);
    for (const call of fetcher.mock.calls) { const body = JSON.parse((call as unknown as [string, RequestInit])[1].body as string); expect(body.disable_notification).toBe(true); expect(JSON.stringify(body)).not.toContain('test-admin-token'); }
  });
  it('releases a failed delivery claim so the next run can retry', async () => {
    vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', 'test'); vi.stubEnv('TELEGRAM_ADMIN_IDS', '470334534');
    const query = vi.fn(async () => ({ rows: [{ last_sent_at: new Date() }] }));
    const db = { query } as unknown as DatabaseService;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    await expect(new PosterService(db).notifyFailure()).resolves.toBeUndefined();
    expect(query.mock.calls.some(call => String(call[0]).startsWith('DELETE'))).toBe(true);
  });
});
