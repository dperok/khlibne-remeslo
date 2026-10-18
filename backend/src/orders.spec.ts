import { describe, expect, it } from 'vitest';
import { priceOrder, validateOrder } from './orders.service.js';
import type { Content } from './content.service.js';
const input = { id: 'a20e769a-4811-402a-8575-b19283817122', token: 'a'.repeat(64), customerName: ' Тест ', phone: '066 123 45 67', items: [{ id: 'bread', quantity: 2 }] };
describe('order validation and authoritative pricing', () => {
  it('normalizes contact and hashes the cancellation capability', () => {
    const result = validateOrder(input);
    expect(result.customerName).toBe('Тест'); expect(result.phone).toBe('+380661234567'); expect(result.tokenHash).not.toBe(input.token);
  });
  it('rejects malformed, duplicate, excessive and fractional items', () => {
    for (const items of [[], [{ id: 'bread', quantity: 0 }], [{ id: 'bread', quantity: 1.5 }], [{ id: 'bread', quantity: 100 }], [input.items[0], input.items[0]]]) expect(() => validateOrder({ ...input, items })).toThrow();
    expect(() => validateOrder({ ...input, token: 'short' })).toThrow();
    expect(() => validateOrder({ ...input, phone: '123' })).toThrow();
  });
  it('takes prices from the catalogue, ignoring client prices and totals', () => {
    const content = { products: [{ id: 'bread', name: 'Хліб', price: 31.25, available: true }] } as Content;
    const result = priceOrder(validateOrder({ ...input, totalKopecks: 1, paid: true }).items, content);
    expect(result.totalKopecks).toBe(6250); expect(result.lines[0].unitKopecks).toBe(3125);
  });
  it('rejects unavailable, hidden and missing-price products', () => {
    for (const product of [{ available: false, price: 20 }, { visible: false, price: 20 }, { available: true }]) expect(() => priceOrder(input.items, { products: [{ id: 'bread', ...product }] } as Content)).toThrow();
  });
});
