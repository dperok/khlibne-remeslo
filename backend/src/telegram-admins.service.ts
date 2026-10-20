import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

export const OWNER_IDS = [470334534, 5711475783] as const;
export function isOwner(id: number) { return (OWNER_IDS as readonly number[]).includes(id); }

@Injectable()
export class TelegramAdminsService {
  constructor(private readonly db: DatabaseService) {}
  async ids(): Promise<number[]> {
    const result = await this.db.query<{ user_id: string }>('SELECT user_id FROM bakery_telegram_admins ORDER BY created_at,user_id');
    return [...new Set<number>([...OWNER_IDS, ...result.rows.map(row => Number(row.user_id))])];
  }
  async has(id: number) {
    if (isOwner(id)) return true;
    return (await this.db.query('SELECT 1 FROM bakery_telegram_admins WHERE user_id=$1', [id])).rowCount! > 0;
  }
  async change(owner: number, rawId: string, add: boolean) {
    // This check must precede *all* DB access. Delegates can never grant roles.
    if (!isOwner(owner)) throw new ForbiddenException('Керувати адміністраторами можуть лише власники.');
    if (!/^[1-9]\d{0,15}$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) throw new BadRequestException('Вкажіть числовий Telegram ID.');
    const id = Number(rawId);
    if (isOwner(id)) throw new BadRequestException('Права двох власників змінити не можна.');
    await this.db.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('telegram-admin-management'))");
      if (add) {
        const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM bakery_telegram_admins');
        if (count.rows[0].count >= 30) throw new BadRequestException('Досягнуто ліміту 30 додаткових адміністраторів.');
        await client.query('INSERT INTO bakery_telegram_admins(user_id,added_by) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, owner]);
      } else {
        await client.query('DELETE FROM bakery_telegram_admins WHERE user_id=$1', [id]);
        await client.query('DELETE FROM bakery_support_deliveries WHERE admin_id=$1', [id]);
        await client.query('DELETE FROM bakery_support_prompts WHERE admin_id=$1', [id]);
        await client.query('DELETE FROM bakery_support_reply_confirmations WHERE admin_id=$1', [id]);
      }
    });
  }
}
