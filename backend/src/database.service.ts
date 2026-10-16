import { Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private pool?: Pool;

  private getPool() {
    if (!process.env.DATABASE_URL) {
      throw new ServiceUnavailableException('DATABASE_URL is not configured');
    }
    if (!this.pool) {
      const connectionUrl = new URL(process.env.DATABASE_URL);
      connectionUrl.searchParams.set('sslmode', 'verify-full');
      this.pool = new Pool({
        connectionString: connectionUrl.toString(),
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      });
      this.pool.on('error', () => console.error('Idle database connection failed'));
    }
    return this.pool;
  }

  query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.getPool().query<T>(sql, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async status(probe: string) {
    try {
      const result = await this.query<{ probe: string; checked_at: Date }>(
        'SELECT $1::text AS probe, clock_timestamp() AS checked_at',
        [probe],
      );
      return { status: 'connected', probe: result.rows[0].probe, checkedAt: result.rows[0].checked_at.toISOString() };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
