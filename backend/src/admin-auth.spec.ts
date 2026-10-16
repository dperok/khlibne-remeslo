import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminController } from './admin.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ContentService } from './content.service.js';
import { TelegramService } from './telegram.service.js';
import { AnalyticsService } from './analytics.service.js';

describe('Admin HTTP authorization', () => {
  let app: INestApplication;
  beforeEach(async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'test-password'); vi.stubEnv('PUBLIC_SITE_URL', 'http://localhost:3000');
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [AdminAuthService,
      { provide: ContentService, useValue: { get: async () => ({ products: [], bakery: {} }), saveProduct: vi.fn() } },
      { provide: TelegramService, useValue: { status: () => ({ user: 'disabled', admin: 'disabled' }) } },
      { provide: AnalyticsService, useValue: { summary: () => ({ days: [] }) } },
    ] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });
  const origin = 'http://localhost:3000';
  async function login() {
    const response = await request(app.getHttpServer()).post('/admin/login').set('Origin', origin).send({ password: 'test-password' }).expect(201);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
    return response.headers['set-cookie'][0].split(';')[0];
  }
  it('blocks unauthenticated reads and writes', async () => {
    await request(app.getHttpServer()).get('/admin/content').expect(401);
    await request(app.getHttpServer()).get('/admin/analytics').expect(401);
    await request(app.getHttpServer()).post('/admin/products').set('Origin', origin).send({}).expect(401);
    await request(app.getHttpServer()).put('/admin/bakery').set('Origin', origin).send({}).expect(401);
  });
  it('requires the right origin and invalidates a session after logout', async () => {
    const cookie = await login();
    await request(app.getHttpServer()).get('/admin/content').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).put('/admin/products/id').set('Cookie', cookie).set('Origin', 'https://evil.example').send({}).expect(403);
    await request(app.getHttpServer()).get('/admin/content').set('Cookie', 'bakery_admin=' + 'a'.repeat(64)).expect(401);
    await request(app.getHttpServer()).post('/admin/logout').set('Cookie', cookie).set('Origin', origin).expect(201);
    await request(app.getHttpServer()).get('/admin/content').set('Cookie', cookie).expect(401);
  });
  it('rejects a cross-site login and rate limits wrong passwords', async () => {
    await request(app.getHttpServer()).post('/admin/login').set('Origin', 'https://evil.example').send({ password: 'test-password' }).expect(403);
    for (let index = 0; index < 5; index++) await request(app.getHttpServer()).post('/admin/login').set('Origin', origin).send({ password: 'wrong' }).expect(401);
    await request(app.getHttpServer()).post('/admin/login').set('Origin', origin).send({ password: 'test-password' }).expect(429);
  });
});
