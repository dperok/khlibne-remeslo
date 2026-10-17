import { Body, Controller, Delete, Get, Header, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminAuthService } from './admin-auth.service.js';
import { ContentService } from './content.service.js';
import { TelegramService } from './telegram.service.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly auth: AdminAuthService, private readonly content: ContentService, private readonly telegram: TelegramService, private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @Header('Cache-Control', 'no-store')
  async analyticsSummary(@Req() req: Request) { await this.auth.requireSession(req); return this.analytics.summary(); }

  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { password?: unknown }) { return this.auth.login(req, res, body); }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.auth.logout(req, res); }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() req: Request) { await this.auth.requireSession(req); return { authenticated: true, temporaryPassword: this.auth.temporaryPassword }; }

  @Get('content')
  @Header('Cache-Control', 'no-store')
  async getContent(@Req() req: Request) {
    await this.auth.requireSession(req);
    return { ...await this.content.get(), bots: this.telegram.status(), temporaryPassword: this.auth.temporaryPassword };
  }

  private async authorize(req: Request) { await this.auth.requireSession(req); this.auth.checkOrigin(req); }

  @Post('products')
  async create(@Req() req: Request, @Body() body: Record<string, unknown>) { await this.authorize(req); return this.content.saveProduct(undefined, body); }

  @Put('products/:id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) { await this.authorize(req); return this.content.saveProduct(id, body); }

  @Delete('products/:id')
  async remove(@Req() req: Request, @Param('id') id: string) { await this.authorize(req); return this.content.removeProduct(id); }

  @Put('bakery')
  async saveBakery(@Req() req: Request, @Body() body: Record<string, unknown>) { await this.authorize(req); return this.content.saveBakery(body); }
}
