import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramService } from './telegram.service.js';
import { DatabaseService } from './database.service.js';

describe('Telegram webhook HTTP boundary', () => {
  let app: INestApplication;
  const handleUpdate = vi.fn(async () => {});
  const retryDeliveries = vi.fn(async () => {});
  const completed = new Set<string>();
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    const key = args.join(':');
    if (sql.startsWith('INSERT INTO bakery_telegram_leases')) return { rowCount: 1 };
    if (sql.startsWith('SELECT 1')) return { rowCount: completed.has(key) ? 1 : 0 };
    if (sql.startsWith('INSERT')) completed.add(key);
    return { rowCount: 0 };
  });
  beforeEach(async () => {
    completed.clear(); vi.clearAllMocks();
    vi.stubEnv('TELEGRAM_USER_WEBHOOK_SECRET', 'user-secret'); vi.stubEnv('TELEGRAM_ADMIN_WEBHOOK_SECRET', 'admin-secret');
    const module = await Test.createTestingModule({ controllers: [TelegramWebhookController], providers: [
      { provide: TelegramService, useValue: { handleUpdate, retryDeliveries } },
      { provide: DatabaseService, useValue: { transaction: async (work: (client: unknown) => unknown) => work({ query }), query } },
    ] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });
  it('rejects missing or cross-bot secrets before accessing the database', async () => {
    await request(app.getHttpServer()).post('/telegram/user').send({ update_id: 1 }).expect(401);
    await request(app.getHttpServer()).post('/telegram/admin').set('X-Telegram-Bot-Api-Secret-Token', 'user-secret').send({ update_id: 1 }).expect(401);
    expect(query).not.toHaveBeenCalled(); expect(handleUpdate).not.toHaveBeenCalled();
  });
  it('processes a successful update once across repeated requests', async () => {
    for (let i = 0; i < 2; i++) await request(app.getHttpServer()).post('/telegram/user').set('X-Telegram-Bot-Api-Secret-Token', 'user-secret').send({ update_id: 10, message: { chat: { id: 123 }, text: '/start' } }).expect(200);
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer()).post('/telegram/admin').set('X-Telegram-Bot-Api-Secret-Token', 'admin-secret').send({ update_id: 10 }).expect(200);
    expect(handleUpdate).toHaveBeenCalledTimes(2);
  });
  it('does not mark failed processing complete and rejects malformed updates', async () => {
    handleUpdate.mockRejectedValueOnce(new Error('temporary failure'));
    await request(app.getHttpServer()).post('/telegram/user').set('X-Telegram-Bot-Api-Secret-Token', 'user-secret').send({ update_id: 12 }).expect(500);
    expect(completed.size).toBe(0);
    await request(app.getHttpServer()).post('/telegram/user').set('X-Telegram-Bot-Api-Secret-Token', 'user-secret').send({}).expect(400);
    await request(app.getHttpServer()).get('/telegram/retry').expect(401);
  });
});
