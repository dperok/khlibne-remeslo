import { ForbiddenException, HttpException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { DatabaseService } from './database.service.js';
import { clientIdentity } from './client-identity.js';

const COOKIE = 'bakery_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
@Injectable()
export class AdminAuthService {
  private readonly sessions = new Map<string, number>();
  private readonly failures = new Map<string, { count: number; reset: number }>();
  private readonly salt = randomBytes(16);
  private readonly password = process.env.ADMIN_PASSWORD ?? '';
  private readonly passwordHash = scryptSync(this.password, this.salt, 32);
  private readonly version = createHmac('sha256', process.env.ADMIN_SESSION_SECRET ?? this.password).update(this.password).digest('hex');
  constructor(@Optional() private readonly db?: DatabaseService) {
    if (process.env.VERCEL && (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32)) throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters on Vercel');
  }

  get temporaryPassword() { return this.password === '3722'; }
  private digest(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private token(req: Request) {
    return /(?:^|;\s*)bakery_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
  }
  private cookieOptions() {
    return { httpOnly: true, sameSite: 'strict' as const, secure: !!process.env.VERCEL || (process.env.PUBLIC_SITE_URL?.startsWith('https://') ?? false), path: '/', maxAge: SESSION_MS };
  }
  checkOrigin(req: Request) {
    const allowed = new Set([process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000']);
    if (!process.env.PUBLIC_SITE_URL || /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(process.env.PUBLIC_SITE_URL)) {
      allowed.add('http://localhost:3000'); allowed.add('http://127.0.0.1:3000');
    }
    if (!req.headers.origin || !allowed.has(req.headers.origin)) throw new ForbiddenException('Недозволене джерело запиту');
  }
  async requireSession(req: Request) {
    const token = this.token(req);
    const hash = token && this.digest(token);
    const expires = hash && (this.db ? (await this.db.query<{ expires: number }>('SELECT extract(epoch FROM expires_at)*1000 AS expires FROM bakery_admin_sessions WHERE token_hash=$1 AND password_version=$2', [hash, this.version])).rows[0]?.expires : this.sessions.get(hash));
    if (!expires || expires <= Date.now()) {
      if (hash) this.sessions.delete(hash);
      throw new UnauthorizedException('Увійдіть до панелі адміністратора');
    }
  }
  async login(req: Request, res: Response, body: { password?: unknown }) {
    this.checkOrigin(req);
    const identity = clientIdentity(req);
    if (this.db) return this.db.transaction(async (client) => {
      const ip = this.digest(identity);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`admin-login:${ip}`]);
      const outcome = await this.databaseLogin(req, res, body, client, ip);
      return outcome;
    }).then((outcome) => { if (outcome.error) throw outcome.error; return outcome.value; });
    const now = Date.now();
    for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
    for (const [key, failure] of this.failures) if (failure.reset <= now) this.failures.delete(key);
    const ip = identity;
    const failure = this.failures.get(ip);
    if (failure && failure.count >= 5) throw new HttpException('Забагато спроб. Повторіть через 15 хвилин.', 429);
    const candidate = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : '';
    const valid = this.password.length > 0 && timingSafeEqual(scryptSync(candidate, this.salt, 32), this.passwordHash);
    if (!valid) {
      if (this.failures.size >= 1000) this.failures.delete(this.failures.keys().next().value!);
      this.failures.set(ip, { count: (failure?.count ?? 0) + 1, reset: failure?.reset ?? now + 15 * 60 * 1000 });
      throw new UnauthorizedException('Невірний пароль');
    }
    this.failures.delete(ip);
    const previous = this.token(req);
    if (previous) this.sessions.delete(this.digest(previous));
    if (this.sessions.size >= 1000) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(this.digest(token), now + SESSION_MS);
    res.cookie(COOKIE, token, this.cookieOptions());
    return { ok: true, temporaryPassword: this.temporaryPassword };
  }
  private async databaseLogin(req: Request, res: Response, body: { password?: unknown }, client: PoolClient, ip: string) {
    const result = await client.query<{ attempts: number }>('SELECT attempts FROM bakery_admin_failures WHERE ip_hash=$1 AND expires_at > now()', [ip]);
    if ((result.rows[0]?.attempts ?? 0) >= 5) return { error: new HttpException('Забагато спроб. Повторіть через 15 хвилин.', 429) };
    const candidate = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : '';
    if (!this.password.length || !timingSafeEqual(scryptSync(candidate, this.salt, 32), this.passwordHash)) {
      await client.query(`INSERT INTO bakery_admin_failures(ip_hash,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
        ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN bakery_admin_failures.expires_at > now() THEN bakery_admin_failures.attempts+1 ELSE 1 END,
        expires_at=CASE WHEN bakery_admin_failures.expires_at > now() THEN bakery_admin_failures.expires_at ELSE EXCLUDED.expires_at END`, [ip]);
      return { error: new UnauthorizedException('Невірний пароль') };
    }
    await client.query('DELETE FROM bakery_admin_failures WHERE ip_hash=$1', [ip]);
    const previous = this.token(req);
    if (previous) await client.query('DELETE FROM bakery_admin_sessions WHERE token_hash=$1', [this.digest(previous)]);
    const token = randomBytes(32).toString('hex');
    await client.query('INSERT INTO bakery_admin_sessions(token_hash,password_version,expires_at) VALUES($1,$2,$3)', [this.digest(token), this.version, new Date(Date.now()+SESSION_MS)]);
    res.cookie(COOKIE, token, this.cookieOptions());
    return { value: { ok: true, temporaryPassword: this.temporaryPassword } };
  }
  async logout(req: Request, res: Response) {
    this.checkOrigin(req);
    const token = this.token(req);
    if (token) {
      this.sessions.delete(this.digest(token));
      if (this.db) await this.db.query('DELETE FROM bakery_admin_sessions WHERE token_hash=$1', [this.digest(token)]);
    }
    res.clearCookie(COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }
}
