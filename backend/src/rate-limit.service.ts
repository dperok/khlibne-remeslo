import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service.js';

@Injectable()
export class RateLimitService {
  constructor(private readonly db: DatabaseService) {}
  async consume(scope: string, identity: string, limit: number, windowSeconds: number) {
    const key = createHash('sha256').update(`${scope}:${identity}`).digest('hex');
    // Fixed-size key, atomic increment, no write on rejected requests. Shared
    // between instances; restarting a server cannot reset a visitor's quota.
    const result = await this.db.query(`INSERT INTO bakery_rate_limits(key,window_start,attempts,expires_at)
      VALUES($1,to_timestamp(floor(extract(epoch FROM now())/$2)*$2),1,now()+($2*2)*interval '1 second')
      ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN bakery_rate_limits.window_start=EXCLUDED.window_start THEN bakery_rate_limits.attempts+1 ELSE 1 END,
        window_start=EXCLUDED.window_start,expires_at=EXCLUDED.expires_at
      WHERE bakery_rate_limits.window_start<>EXCLUDED.window_start OR bakery_rate_limits.attempts<$3
      RETURNING attempts`, [key, windowSeconds, limit]);
    if (!result.rows.length) throw new HttpException('Забагато запитів. Спробуйте пізніше.', 429);
  }
}
