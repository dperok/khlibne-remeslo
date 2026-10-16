import { ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE = 'bakery_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
@Injectable()
export class AdminAuthService {
  private readonly sessions = new Map<string, number>();
  private readonly failures = new Map<string, { count: number; reset: number }>();
  private readonly salt = randomBytes(16);
  private readonly password = process.env.ADMIN_PASSWORD ?? '';
  private readonly passwordHash = scryptSync(this.password, this.salt, 32);

  get temporaryPassword() { return this.password === '3722'; }
  private digest(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private token(req: Request) {
    return /(?:^|;\s*)bakery_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
  }
  private cookieOptions() {
    return { httpOnly: true, sameSite: 'strict' as const, secure: process.env.PUBLIC_SITE_URL?.startsWith('https://') ?? false, path: '/', maxAge: SESSION_MS };
  }
  checkOrigin(req: Request) {
    const allowed = new Set([process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000']);
    if (!process.env.PUBLIC_SITE_URL || /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(process.env.PUBLIC_SITE_URL)) {
      allowed.add('http://localhost:3000'); allowed.add('http://127.0.0.1:3000');
    }
    if (!req.headers.origin || !allowed.has(req.headers.origin)) throw new ForbiddenException('Недозволене джерело запиту');
  }
  requireSession(req: Request) {
    const token = this.token(req);
    const hash = token && this.digest(token);
    const expires = hash && this.sessions.get(hash);
    if (!expires || expires <= Date.now()) {
      if (hash) this.sessions.delete(hash);
      throw new UnauthorizedException('Увійдіть до панелі адміністратора');
    }
  }
  login(req: Request, res: Response, body: { password?: unknown }) {
    this.checkOrigin(req);
    const now = Date.now();
    for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
    for (const [key, failure] of this.failures) if (failure.reset <= now) this.failures.delete(key);
    const ip = req.ip ?? 'unknown';
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
  logout(req: Request, res: Response) {
    this.checkOrigin(req);
    const token = this.token(req);
    if (token) this.sessions.delete(this.digest(token));
    res.clearCookie(COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }
}
