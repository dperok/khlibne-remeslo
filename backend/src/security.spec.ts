import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { ContentService } from './content.service.js';
import { TelegramService } from './telegram.service.js';
import { AnalyticsService, kyivDay } from './analytics.service.js';
import { PosterService } from './poster.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { TelegramAdminsService } from './telegram-admins.service.js';
import { BotCommandsService } from './bot-commands.service.js';
import type { DatabaseService } from './database.service.js';
import { randomUUID } from 'node:crypto';
import { clientHeaders, limitedBody } from '../../frontend/src/app/proxy-security';

afterEach(() => vi.unstubAllEnvs());
describe('Trusted proxy boundary', () => {
  it('isolates login quotas by signed edge identity and rejects spoofing, stale signatures and wrong routes', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('ADMIN_SESSION_SECRET', 'a'.repeat(64));
    vi.stubEnv('ADMIN_PASSWORD', 'test-password'); vi.stubEnv('PUBLIC_SITE_URL', 'https://test.invalid');
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [AdminAuthService,
      ...[ContentService, TelegramService, AnalyticsService, PosterService].map(provide => ({ provide, useValue: {} })),
    ] }).compile();
    const app = module.createNestApplication(); await app.init();
    const signed = (ip: string, path = '/admin/login') => clientHeaders(new Request('https://test.invalid/api/admin/login', { method: 'POST', headers: { 'x-forwarded-for': ip } }), path);
    try {
      const wrong = () => request(app.getHttpServer()).post('/admin/login').set('Origin', 'https://test.invalid').send({ password: 'wrong' });
      for (let i = 0; i < 5; i++) await wrong().set(signed('198.51.100.10')).expect(401);
      await wrong().set(signed('198.51.100.10')).expect(429);
      const good = () => request(app.getHttpServer()).post('/admin/login').set('Origin', 'https://test.invalid').send({ password: 'test-password' });
      const valid = await good().set(signed('203.0.113.20')).expect(201);
      expect(valid.headers['set-cookie'][0]).toContain('Secure');
      await good().set('X-Forwarded-For', '203.0.113.30').expect(401);
      await good().set({ ...signed('203.0.113.20'), 'x-bakery-client': `${Date.now()}:${'0'.repeat(64)}` }).expect(401);
      await good().set(signed('203.0.113.20', '/analytics/visit')).expect(401);
      const value = `${Date.now() - 120000}:${'a'.repeat(64)}`;
      await good().set({ 'x-bakery-client': value, 'x-bakery-signature': createHmac('sha256', 'a'.repeat(64)).update(`proxy-v1:POST:/admin/login:${value}`).digest('hex') }).expect(401);
    } finally { await app.close(); }
  });
  it('ignores untrusted forwarded addresses locally and refuses ambiguous edge headers', () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('ADMIN_SESSION_SECRET', 'a'.repeat(64));
    expect(() => clientHeaders(new Request('https://test.invalid', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '/admin/login')).toThrow();
    vi.stubEnv('VERCEL', '');
    expect(clientHeaders(new Request('http://localhost'), '/admin/login')).toEqual({});
  });
  it('limits bytes while reading a body, including a stream without Content-Length', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(1025))); controller.close(); } });
    const req = new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await limitedBody(req, 1024)).toBeNull();
    expect(await limitedBody(new Request('http://localhost', { method: 'POST', body: 'привіт' }), 20)).toBe('привіт');
  });
});

describe('Persistent admission limits', () => {
  it('rejects an exhausted atomic DB quota and prevents analytics inserts', async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [] }));
    const db = { query } as unknown as DatabaseService;
    const limits = new RateLimitService(db);
    const analytics = new AnalyticsService(db, limits);
    await expect(analytics.record({ visitorId: randomUUID(), sessionId: randomUUID(), activeMs: 0, day: kyivDay() }, 'signed-client')).rejects.toMatchObject({ status: 429 });
    expect(query.mock.calls.every(args => !String(args[0]).includes('INSERT INTO bakery_site_visits'))).toBe(true);
  });
});

describe('Owner-only Telegram delegation', () => {
  it.each([470334534, 5711475783])('lets owner %s add/remove a delegate without granting delegation', async owner => {
    const ids = new Set<number>();
    const admins = { has: async (id: number) => [470334534, 5711475783].includes(id) || ids.has(id), ids: async () => [470334534, 5711475783, ...ids], change: vi.fn(async (_owner: number, id: string, add: boolean) => { if (add) ids.add(Number(id)); else ids.delete(Number(id)); }) };
    const content = { get: async () => ({ products: [] }) } as unknown as ContentService;
    const commands = new BotCommandsService(content, admins as unknown as TelegramAdminsService);
    const msg = (id: number, text: string) => ({ from: { id }, chat: { id, type: 'private' }, text });
    expect(await commands.handle('admin', msg(123456789, '/status'))).toBeNull();
    await commands.handle('admin', msg(owner, '/addadmin 123456789'));
    expect(await commands.handle('admin', msg(123456789, '/status'))).toContain('Товарів');
    admins.change.mockClear();
    for (const text of ['/addadmin 987654321', '/removeadmin 5711475783', '/admins']) expect(await commands.handle('admin', msg(123456789, text))).toContain('лише власники');
    expect(admins.change).not.toHaveBeenCalled();
    await commands.handle('user', msg(owner, '/addadmin 987654321'));
    await commands.handle('admin', { ...msg(owner, '/addadmin 987654321'), chat: { id: owner, type: 'group' } });
    expect(admins.change).not.toHaveBeenCalled();
    await commands.handle('admin', msg(owner, '/removeadmin 123456789'));
    expect(await commands.handle('admin', msg(123456789, '/status'))).toBeNull();
  });
  it('enforces owner status again at the repository boundary before touching SQL', async () => {
    const transaction = vi.fn(), query = vi.fn();
    const db = { transaction, query } as unknown as DatabaseService;
    const admins = new TelegramAdminsService(db);
    await expect(admins.change(123456789, '987654321', true)).rejects.toMatchObject({ status: 403 });
    for (const id of ['470334534', '5711475783', '1e9', '-1', '9007199254740992']) await expect(admins.change(470334534, id, true)).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
});
