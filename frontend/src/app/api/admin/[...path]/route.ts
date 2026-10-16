type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context) {
  const { path } = await context.params;
  const route = path.join('/');
  if (!/^(login|logout|session|content|analytics|bakery|products(?:\/[a-zA-Z0-9-]+)?)$/.test(route)) return Response.json({ message: 'Не знайдено' }, { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const expected = process.env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
    if (!origin || origin !== expected) return Response.json({ message: 'Недозволене джерело запиту' }, { status: 403 });
  }
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
  if (body && body.length > 30000) return Response.json({ message: 'Завеликий запит' }, { status: 413 });
  try {
    const response = await fetch(new URL(`/admin/${route}`, process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'), {
      method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '', Origin: request.headers.get('origin') ?? '' },
    });
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    const cookie = response.headers.get('set-cookie');
    if (cookie) headers.set('set-cookie', cookie);
    return new Response(response.body, { status: response.status, headers });
  } catch { return Response.json({ message: 'Сервер недоступний. Спробуйте пізніше.' }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
