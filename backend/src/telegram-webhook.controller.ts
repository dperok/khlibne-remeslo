import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { TelegramService } from './telegram.service.js';
import type { Update } from './telegram.service.js';

function equals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService, private readonly db: DatabaseService) {}
  @Post(':role')
  @HttpCode(200)
  async webhook(@Param('role') role: string, @Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: Update) {
    if (role !== 'user' && role !== 'admin') throw new BadRequestException('Unknown bot');
    const expected = process.env[role === 'user' ? 'TELEGRAM_USER_WEBHOOK_SECRET' : 'TELEGRAM_ADMIN_WEBHOOK_SECRET'];
    if (!equals(secret, expected)) throw new UnauthorizedException();
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) throw new BadRequestException('Invalid update');
    const sender = update.message?.chat?.id ?? update.callback_query?.from?.id ?? update.update_id;
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`telegram:${role}:${sender}`]);
      if ((await client.query('SELECT 1 FROM bakery_telegram_updates WHERE role=$1 AND update_id=$2', [role, update.update_id])).rowCount) return;
      await this.telegram.handleUpdate(role, update);
      await client.query('INSERT INTO bakery_telegram_updates(role,update_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [role, update.update_id]);
    });
    return { ok: true };
  }
  @Get('retry')
  async retry(@Headers('authorization') authorization: string | undefined) {
    if (!process.env.CRON_SECRET || !equals(authorization, `Bearer ${process.env.CRON_SECRET}`)) throw new UnauthorizedException();
    await this.telegram.retryDeliveries();
    await this.db.query("DELETE FROM bakery_telegram_updates WHERE processed_at < now() - interval '7 days'");
    await this.db.query('DELETE FROM bakery_admin_sessions WHERE expires_at < now()');
    await this.db.query('DELETE FROM bakery_admin_failures WHERE expires_at < now()');
    return { ok: true };
  }
}
