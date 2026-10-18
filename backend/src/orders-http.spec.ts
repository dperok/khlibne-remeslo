import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OrdersController, AdminOrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AdminAuthService } from './admin-auth.service.js';
describe('order HTTP boundaries', () => {
  let app: INestApplication;
  const orders = { create: vi.fn(async () => ({ status: 'new', paymentStatus: 'unpaid' })), customerOrder: vi.fn(async () => ({ status: 'cancelled' })), list: vi.fn(), update: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks(); vi.stubEnv('PUBLIC_SITE_URL', 'https://bakery.test');
    const module = await Test.createTestingModule({ controllers: [OrdersController, AdminOrdersController], providers: [AdminAuthService, { provide: OrdersService, useValue: orders }] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });
  it('requires an admin session for listing or changing orders', async () => {
    await request(app.getHttpServer()).get('/admin/orders').expect(401);
    await request(app.getHttpServer()).put('/admin/orders/test').set('Origin', 'https://bakery.test').send({ status: 'completed' }).expect(401);
    expect(orders.list).not.toHaveBeenCalled(); expect(orders.update).not.toHaveBeenCalled();
  });
  it('blocks cross-origin creation and cancellation before touching orders', async () => {
    await request(app.getHttpServer()).post('/orders').set('Origin', 'https://other.test').send({}).expect(403);
    await request(app.getHttpServer()).delete('/orders/test').expect(403);
    expect(orders.create).not.toHaveBeenCalled(); expect(orders.customerOrder).not.toHaveBeenCalled();
  });
  it('accepts same-origin checkout and forwards the cancellation capability', async () => {
    await request(app.getHttpServer()).post('/orders').set('Origin', 'https://bakery.test').send({ items: [] }).expect(201);
    await request(app.getHttpServer()).delete('/orders/test').set('Origin', 'https://bakery.test').set('x-order-token', 'private-capability').expect(200);
    expect(orders.customerOrder).toHaveBeenCalledWith('test', 'private-capability', true);
  });
});
