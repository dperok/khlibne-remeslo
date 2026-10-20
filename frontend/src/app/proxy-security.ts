import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function clientHeaders(request: Request, backendPath: string): Record<string, string> {
  if (!process.env.VERCEL) return {};
  const secret = process.env.ADMIN_SESSION_SECRET;
  // Vercel overwrites X-Forwarded-For at ingress. Do not enable an external
  // proxy's trusted-IP override without revisiting this boundary.
  const ip = request.headers.get('x-forwarded-for')?.trim();
  if (!secret || secret.length < 32 || !ip || !isIP(ip)) throw new Error('Trusted client identity unavailable');
  const id = createHmac('sha256', secret).update(`client-v1:${ip}`).digest('hex');
  const value = `${Date.now()}:${id}`;
  return { 'x-bakery-client': value, 'x-bakery-signature': createHmac('sha256', secret).update(`proxy-v1:${request.method}:${backendPath}:${value}`).digest('hex') };
}

export async function limitedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      parts.push(value);
    }
    return Buffer.concat(parts).toString('utf8');
  } finally { reader.releaseLock(); }
}
