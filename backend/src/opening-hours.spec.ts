import { isBakeryOpen, type OpeningHours } from './opening-hours.js';
const daily: OpeningHours = Array.from({ length: 7 }, () => ({ open: '08:00', close: '20:00' }));
describe('Kyiv opening hours', () => {
  it('uses Kyiv daylight saving time and exact closing boundary', () => {
    expect(isBakeryOpen(daily, new Date('2026-07-01T05:00:00Z'))).toBe(true);
    expect(isBakeryOpen(daily, new Date('2026-07-01T17:00:00Z'))).toBe(false);
    expect(isBakeryOpen(daily, new Date('2026-12-01T05:00:00Z'))).toBe(false);
    expect(isBakeryOpen(daily, new Date('2026-12-01T06:00:00Z'))).toBe(true);
  });
  it('handles days off and an overnight interval across the week boundary', () => {
    const hours: OpeningHours = Array(7).fill(null); hours[6] = { open: '22:00', close: '02:00' };
    expect(isBakeryOpen(hours, new Date('2026-10-18T20:00:00Z'))).toBe(true);
    expect(isBakeryOpen(hours, new Date('2026-10-18T22:00:00Z'))).toBe(true);
    expect(isBakeryOpen(hours, new Date('2026-10-18T23:00:00Z'))).toBe(false);
    expect(isBakeryOpen(hours, new Date('2026-10-19T12:00:00Z'))).toBe(false);
  });
});
