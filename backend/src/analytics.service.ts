import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service.js';

export function kyivDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AnalyticsDay = { day: string; visitors: number; sessions: number; averageActiveMs: number };

@Injectable()
export class AnalyticsService {
  private cleanedDay = '';
  constructor(private readonly database: DatabaseService) {}
  async record(body: { visitorId?: unknown; sessionId?: unknown; activeMs?: unknown; day?: unknown }) {
    const today = kyivDay();
    const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    if (!body || typeof body.visitorId !== 'string' || !uuid.test(body.visitorId) || typeof body.sessionId !== 'string' || !uuid.test(body.sessionId) ||
      typeof body.activeMs !== 'number' || !Number.isSafeInteger(body.activeMs) || body.activeMs < 0 || body.activeMs > 86400000 ||
      (body.day !== today && body.day !== yesterday)) throw new BadRequestException('Некоректна подія відвідування');
    const visitorHash = createHash('sha256').update(body.visitorId).digest('hex');
    await this.database.query(`INSERT INTO bakery_site_visits(day, session_id, visitor_hash, active_ms)
      VALUES ($1::date, $2::uuid, $3, LEAST($4::int, 15000))
      ON CONFLICT(day, session_id) DO UPDATE SET
        active_ms = GREATEST(bakery_site_visits.active_ms, LEAST($4::int,
          15000 + FLOOR(EXTRACT(EPOCH FROM (now() - bakery_site_visits.first_seen)) * 1000)::int)),
        last_seen = now()
      WHERE bakery_site_visits.visitor_hash = EXCLUDED.visitor_hash`, [body.day, body.sessionId, visitorHash, body.activeMs]);
    if (this.cleanedDay !== today) {
      await this.database.query("DELETE FROM bakery_site_visits WHERE day < (now() AT TIME ZONE 'Europe/Kyiv')::date - 90");
      this.cleanedDay = today;
    }
    return { ok: true };
  }

  async summary() {
    const result = await this.database.query<AnalyticsDay>(`SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT v.visitor_hash)::int AS visitors, COUNT(v.session_id)::int AS sessions,
      COALESCE(ROUND(AVG(v.active_ms)), 0)::int AS "averageActiveMs"
      FROM generate_series((now() AT TIME ZONE 'Europe/Kyiv')::date - 6,
        (now() AT TIME ZONE 'Europe/Kyiv')::date, '1 day'::interval) AS d(day)
      LEFT JOIN bakery_site_visits v ON v.day = d.day::date
      GROUP BY d.day ORDER BY d.day DESC`);
    return { timezone: 'Europe/Kyiv', today: result.rows[0], days: result.rows, retentionDays: 90 };
  }
}
