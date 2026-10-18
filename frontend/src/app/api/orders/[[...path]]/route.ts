import { backendUrl } from '../../../backend-url';
import { connection } from 'next/server';
type Context = { params: Promise<{ path?: string[] }> };
async function proxy(request: Request, context: Context) {
  await connection();
  const { path = [] } = await context.params;
  if (path.length > 1 || (path[0] && !/^[a-f0-9-]{36}$/i.test(path[0])) || (!path.length && request.method !== 'POST')) return Response.json({ message: 'Не знайдено' }, { status: 404 });
  const origin = request.headers.get('origin') ?? '';
  if (request.method !== 'GET' && origin !== (process.env.PUBLIC_SITE_URL ?? new URL(request.url).origin)) return Response.json({ message: 'Недозволене джерело запиту' }, { status: 403 });
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > 16000) return Response.json({ message: 'Завеликий запит' }, { status: 413 });
  try {
    const response = await fetch(backendUrl(`/orders${path[0] ? `/${path[0]}` : ''}`), { method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Origin: origin, 'x-order-token': request.headers.get('x-order-token') ?? '' } });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ message: 'Не вдалося перевірити оформлення. Спробуйте ще раз — замовлення не дублюється.' }, { status: 503 }); }
}
export const POST = proxy;
export const GET = proxy;
export const DELETE = proxy;
