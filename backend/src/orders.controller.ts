import { Body, Controller, Delete, Get, Header, Headers, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly auth: AdminAuthService) {}
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() req: Request, @Body() body: Record<string, unknown>) { this.auth.checkOrigin(req); return this.orders.create(body); }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @Headers('x-order-token') token?: string) { return this.orders.customerOrder(id, token); }
  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  cancel(@Req() req: Request, @Param('id') id: string, @Headers('x-order-token') token?: string) { this.auth.checkOrigin(req); return this.orders.customerOrder(id, token, true); }
}
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService, private readonly auth: AdminAuthService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() req: Request) { await this.auth.requireSession(req); return this.orders.list(); }
  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: { status?: unknown }) { await this.auth.requireSession(req); this.auth.checkOrigin(req); return this.orders.update(id, body?.status); }
}
