import { posterAvailability, PosterService } from './poster.service.js';
import { PosterController } from './poster.controller.js';
import type { Product } from './content.service.js';
import type { DatabaseService } from './database.service.js';

const product = (id = 'poster-product-35', available = true): Product => ({ id, name: 'Кекс', available, price: 17 } as Product);
const menu = [{ product_id: '35', ingredient_id: '144' }];
const stock = (quantity: string) => [{ ingredient_id: '144', ingredients_type: '2', ingredient_left: quantity }];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Poster stock sync', () => {
  it.each(['0.0000000', '-3.25'])('marks nonpositive stock %s unavailable using IDs, preserving other fields', quantity => {
    const p = product(); const result = posterAvailability([p], menu, stock(quantity));
    expect(result.products[0]).toEqual({ ...p, available: false }); expect(p.available).toBe(true);
    expect(result.summary).toMatchObject({ matched: 1, changed: 1, unavailable: 1 });
  });
  it('restores availability when stock becomes positive', () => {
    expect(posterAvailability([product(undefined, false)], menu, stock('0.1')).products[0].available).toBe(true);
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
    expect(posterAvailability([product()], menu, [{ ...stock('8')[0], storage_ingredient_left: '0' }], true).products[0].available).toBe(false);
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
