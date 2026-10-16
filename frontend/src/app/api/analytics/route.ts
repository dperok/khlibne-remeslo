export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== (process.env.PUBLIC_SITE_URL ?? new URL(request.url).origin)) return new Response(null, { status: 403 });
  const body = await request.text();
  if (body.length > 1024) return new Response(null, { status: 413 });
  try {
    const result = await fetch(new URL('/analytics/visit', process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body,
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    return new Response(null, { status: result.ok ? 204 : result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return new Response(null, { status: 503 }); }
}
