import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Optional, Param, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { TelegramService } from './telegram.service.js';
import type { Update } from './telegram.service.js';
import { SupportRepository } from './support.repository.js';

function equals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService, private readonly db: DatabaseService, @Optional() private readonly support?: SupportRepository) {}
  @Post(':role')
  @HttpCode(200)
  async webhook(@Param('role') role: string, @Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: Update) {
    if (role !== 'user' && role !== 'admin') throw new BadRequestException('Unknown bot');
    const expected = process.env[role === 'user' ? 'TELEGRAM_USER_WEBHOOK_SECRET' : 'TELEGRAM_ADMIN_WEBHOOK_SECRET'];
    if (!equals(secret, expected)) throw new UnauthorizedException();
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) throw new BadRequestException('Invalid update');
    const sender = update.message?.chat?.id ?? update.callback_query?.from?.id ?? update.update_id;
    if (!Number.isSafeInteger(sender)) throw new BadRequestException('Invalid sender');
    const key = `telegram:${role}:${sender}`;
    const token = randomUUID();
    const acquired = await this.db.transaction(async (client) => {
      if ((await client.query('SELECT 1 FROM bakery_telegram_updates WHERE role=$1 AND update_id=$2', [role, update.update_id])).rowCount) return;
      // Keep serialization and crash recovery without occupying a DB connection
      // while Telegram and nested repositories perform their network requests.
      const lease = await client.query(`INSERT INTO bakery_telegram_leases(key,token,expires_at) VALUES($1,$2,now()+interval '90 seconds')
        ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
        WHERE bakery_telegram_leases.expires_at<now() RETURNING token`, [key, token]);
      if (!lease.rowCount) throw new ServiceUnavailableException('Update is already processing');
      return true;
    });
    if (!acquired) return { ok: true };
    try {
      // A preceding instance may have completed between the first lookup and lease acquisition.
      if ((await this.db.query('SELECT 1 FROM bakery_telegram_updates WHERE role=$1 AND update_id=$2', [role, update.update_id])).rowCount) return { ok: true };
      await this.telegram.handleUpdate(role, update);
      await this.db.query('INSERT INTO bakery_telegram_updates(role,update_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [role, update.update_id]);
    } finally { await this.db.query('DELETE FROM bakery_telegram_leases WHERE key=$1 AND token=$2', [key, token]); }
    return { ok: true };
  }
  @Get('retry')
  async retry(@Headers('authorization') authorization: string | undefined) {
    if (!process.env.CRON_SECRET || !equals(authorization, `Bearer ${process.env.CRON_SECRET}`)) throw new UnauthorizedException();
    await this.support?.cleanup();
    await this.telegram.retryDeliveries();
    await this.db.query("DELETE FROM bakery_telegram_updates WHERE processed_at < now() - interval '7 days'");
    await this.db.query('DELETE FROM bakery_admin_sessions WHERE expires_at < now()');
    await this.db.query('DELETE FROM bakery_admin_failures WHERE expires_at < now()');
    await this.db.query('DELETE FROM bakery_rate_limits WHERE expires_at < now()');
    await this.db.query('DELETE FROM bakery_telegram_leases WHERE expires_at < now()');
    return { ok: true };
  }
}
