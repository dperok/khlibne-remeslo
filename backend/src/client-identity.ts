import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

// The frontend signs a Vercel-overwritten client address. Never trust raw XFF here:
// req.ip is the frontend service's transport address, shared by unrelated visitors.
export function clientIdentity(req: Request): string {
  if (!process.env.VERCEL) return req.ip ?? 'local';
  const value = req.header('x-bakery-client');
  const signature = req.header('x-bakery-signature');
  const secret = process.env.ADMIN_SESSION_SECRET;
  const match = /^(\d{13}):([a-f0-9]{64})$/.exec(value ?? '');
  if (!secret || secret.length < 32 || !match || !/^[a-f0-9]{64}$/.test(signature ?? '') || Math.abs(Date.now() - Number(match[1])) > 60000) throw new UnauthorizedException();
  const expected = createHmac('sha256', secret).update(`proxy-v1:${req.method}:${req.path}:${value}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature!, 'hex'))) throw new UnauthorizedException();
  return match[2];
}
