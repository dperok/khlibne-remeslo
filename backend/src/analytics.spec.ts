import { AnalyticsService, kyivDay } from './analytics.service.js';
import type { DatabaseService } from './database.service.js';
import { randomUUID } from 'node:crypto';
import type { RateLimitService } from './rate-limit.service.js';

describe('Visit analytics', () => {
  it('groups by Kyiv calendar date across UTC midnight and DST', () => {
    expect(kyivDay(new Date('2026-10-15T22:30:00Z'))).toBe('2026-10-16');
    expect(kyivDay(new Date('2026-12-15T22:30:00Z'))).toBe('2026-12-16');
  });
  it('validates events before writing and hashes visitor identifiers', async () => {
    const database = { query: vi.fn(async () => ({ rows: [] })) };
    const limits = { consume: vi.fn() };
    const service = new AnalyticsService(database as unknown as DatabaseService, limits as unknown as RateLimitService);
    const visitorId = randomUUID();
    const sessionId = randomUUID();
    const body = { visitorId, sessionId, day: kyivDay(), activeMs: 1234 };
    await service.record(body, 'test-client');
    expect(database.query.mock.calls[0][1]).toEqual([body.day, sessionId, expect.stringMatching(/^[a-f0-9]{64}$/), 1234]);
    expect(database.query.mock.calls[0][1]).not.toContain(visitorId);
    database.query.mockClear();
    for (const bad of [{ ...body, activeMs: -1 }, { ...body, activeMs: 86400001 }, { ...body, activeMs: 0.5 }, { ...body, day: '2020-01-01' }, { ...body, visitorId: 'invalid' }]) {
      await expect(service.record(bad, 'test-client')).rejects.toThrow('Некоректна подія');
    }
    expect(database.query).not.toHaveBeenCalled();
  });
});
