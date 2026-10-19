import { describe, expect, it } from 'vitest';
import { cartQuantityDigits, cartQuantityLimit } from './cart-limits.js';
import { ContentService } from './content.service.js';
describe('cart quantity configuration', () => {
  it('defaults to two digits and supports one to four digits', () => {
    expect(cartQuantityLimit(undefined)).toBe(99);
    for (const value of [0, 5, 1.5, '3', null]) expect(cartQuantityDigits(value)).toBe(2);
    expect([1, 2, 3, 4].map(cartQuantityLimit)).toEqual([9, 99, 999, 9999]);
  });
  it('rejects invalid settings before changing the content', async () => {
    const service = new ContentService({} as never);
    for (const quantityDigits of [0, 5, 2.5, '3', null]) await expect(service.saveBakery({ quantityDigits })).rejects.toThrow('Ліміт кількості');
  });
});
