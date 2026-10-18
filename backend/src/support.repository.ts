import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';

export type Ticket = { id: string; user_id: string; source_message_id: string | number; sender_name: string; message_text: string };
export type ReplyConfirmation = { id: string; admin_id: string; source_message_id: string; ticket_id: string; message_text: string };
@Injectable()
export class SupportRepository {
  constructor(private readonly db: DatabaseService) {}
  async withReplyLock(ticket: string, work: (store: SupportRepository) => Promise<void>) {
    return this.db.transaction(async client => {
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [`support-reply:${ticket}`]);
      if (!result.rows[0].locked) return false;
      const scoped = new SupportRepository({ query: client.query.bind(client) } as unknown as DatabaseService);
      await work(scoped); return true;
    });
  }
  async hasReply(ticket: string) { return (await this.db.query('SELECT 1 FROM bakery_support_replies WHERE ticket_id=$1 LIMIT 1', [ticket])).rowCount! > 0; }
  async latestReply(ticket: string) {
    return (await this.db.query<{ admin_id: string; admin_name: string | null; message_text: string | null }>('SELECT admin_id,admin_name,message_text FROM bakery_support_replies WHERE ticket_id=$1 ORDER BY created_at DESC,source_message_id DESC LIMIT 1', [ticket])).rows[0];
  }
  async saveConfirmation(admin: number, messageId: number, ticket: string, text: string) {
    await this.db.query("DELETE FROM bakery_support_reply_confirmations WHERE created_at < now()-interval '24 hours'");
    return (await this.db.query<ReplyConfirmation>('INSERT INTO bakery_support_reply_confirmations(id,admin_id,source_message_id,ticket_id,message_text) VALUES($1,$2,$3,$4,$5) ON CONFLICT(admin_id,source_message_id) DO UPDATE SET admin_id=excluded.admin_id RETURNING *', [randomUUID(),admin,messageId,ticket,text])).rows[0];
  }
  async confirmationPrompt(id: string, prompt: number) { await this.db.query('UPDATE bakery_support_reply_confirmations SET prompt_id=$2 WHERE id=$1', [id,prompt]); }
  async getConfirmation(id: string, admin: number, prompt: number) {
    return (await this.db.query<ReplyConfirmation>("SELECT c.* FROM bakery_support_reply_confirmations c JOIN bakery_support_deliveries d ON d.ticket_id=c.ticket_id AND d.admin_id=c.admin_id WHERE c.id=$1 AND c.admin_id=$2 AND c.prompt_id=$3 AND c.created_at > now()-interval '24 hours'", [id,admin,prompt])).rows[0];
  }
  async takeConfirmation(id: string, admin: number) { return (await this.db.query("DELETE FROM bakery_support_reply_confirmations WHERE id=$1 AND admin_id=$2 AND created_at > now()-interval '24 hours' RETURNING id", [id,admin])).rowCount! > 0; }
  async ticketById(id: string) { return (await this.db.query<Ticket>('SELECT * FROM bakery_support_messages WHERE id=$1', [id])).rows[0]; }
  async setMode(userId: number, enabled: boolean) {
    if (enabled) await this.db.query("INSERT INTO bakery_support_modes(user_id, expires_at) VALUES ($1, now() + interval '30 minutes') ON CONFLICT(user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at", [userId]);
    else await this.db.query('DELETE FROM bakery_support_modes WHERE user_id = $1', [userId]);
  }
  async inMode(userId: number) { return (await this.db.query('SELECT 1 FROM bakery_support_modes WHERE user_id = $1 AND expires_at > now()', [userId])).rowCount! > 0; }
  async create(userId: number, messageId: number, name: string, text: string, admins: number[]) {
    return this.db.transaction(async (client) => {
      const result = await client.query<Ticket>('INSERT INTO bakery_support_messages(id, user_id, source_message_id, sender_name, message_text) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(user_id,source_message_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *', [randomUUID(), userId, messageId, name, text]);
      const ticket = result.rows[0];
      for (const admin of admins) await client.query('INSERT INTO bakery_support_deliveries(ticket_id, admin_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ticket.id, admin]);
      return ticket;
    });
  }
  async pending(admin: number) { return (await this.db.query<Ticket>('SELECT m.* FROM bakery_support_messages m JOIN bakery_support_deliveries d ON d.ticket_id=m.id WHERE d.admin_id=$1 AND d.message_id IS NULL ORDER BY m.created_at LIMIT 30', [admin])).rows; }
  async delivered(ticket: string, admin: number, messageId: number) { await this.db.query('UPDATE bakery_support_deliveries SET message_id=$3 WHERE ticket_id=$1 AND admin_id=$2', [ticket, admin, messageId]); }
  async countDelivered(ticket: string) { return (await this.db.query<{ count: number }>('SELECT count(*)::int AS count FROM bakery_support_deliveries WHERE ticket_id=$1 AND message_id IS NOT NULL', [ticket])).rows[0].count; }
  async ticketForButton(id: string, admin: number, messageId: number) { return (await this.db.query<Ticket>('SELECT m.* FROM bakery_support_messages m JOIN bakery_support_deliveries d ON d.ticket_id=m.id WHERE m.id=$1 AND d.admin_id=$2 AND d.message_id=$3', [id, admin, messageId])).rows[0]; }
  async savePrompt(admin: number, promptId: number, ticket: string) { await this.db.query('INSERT INTO bakery_support_prompts(admin_id,prompt_id,ticket_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [admin, promptId, ticket]); }
  async cancelPrompts(admin: number) { await this.db.query('DELETE FROM bakery_support_prompts WHERE admin_id=$1', [admin]); await this.db.query('DELETE FROM bakery_support_reply_confirmations WHERE admin_id=$1', [admin]); }
  async ticketForPrompt(admin: number, promptId: number) { return (await this.db.query<Ticket>("SELECT m.* FROM bakery_support_messages m JOIN bakery_support_prompts p ON p.ticket_id=m.id WHERE p.admin_id=$1 AND p.prompt_id=$2 AND p.created_at > now() - interval '24 hours'", [admin, promptId])).rows[0]; }
  async replied(admin: number, messageId: number) { return (await this.db.query('SELECT 1 FROM bakery_support_replies WHERE admin_id=$1 AND source_message_id=$2', [admin, messageId])).rowCount! > 0; }
  async markReplied(admin: number, messageId: number, ticket: string, text?: string, adminName?: string) { await this.db.query('INSERT INTO bakery_support_replies(admin_id,source_message_id,ticket_id,message_text,admin_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [admin, messageId, ticket, text ?? null, adminName ?? null]); }
  async saveVisitorAnswer(ticket: string, messageId: number) {
    await this.db.query('INSERT INTO bakery_support_visitor_answers(user_id,message_id,ticket_id) SELECT user_id,$2,id FROM bakery_support_messages WHERE id=$1 ON CONFLICT DO NOTHING', [ticket, messageId]);
  }
  async isVisitorReply(userId: number, messageId: number) {
    return (await this.db.query('SELECT 1 FROM bakery_support_visitor_answers a JOIN bakery_support_messages m ON m.id=a.ticket_id WHERE a.user_id=$1 AND m.user_id=$1 AND a.message_id=$2', [userId, messageId])).rowCount! > 0;
  }
  async pendingReplyStatuses() {
    return (await this.db.query<{ ticket_id: string; admin_id: string; message_id: string; answered_by: string }>(`SELECT d.ticket_id, d.admin_id, d.message_id, r.admin_id AS answered_by
      FROM bakery_support_deliveries d
      JOIN LATERAL (SELECT admin_id FROM bakery_support_replies WHERE ticket_id=d.ticket_id ORDER BY created_at LIMIT 1) r ON true
      WHERE d.message_id IS NOT NULL AND NOT d.reply_status_notified LIMIT 100`)).rows;
  }
  async replyStatusNotified(ticket: string, admin: string) {
    await this.db.query('UPDATE bakery_support_deliveries SET reply_status_notified=true WHERE ticket_id=$1 AND admin_id=$2', [ticket, admin]);
  }
}
