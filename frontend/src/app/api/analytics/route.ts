import { backendUrl } from '../../backend-url';
import { clientHeaders, limitedBody } from '../../proxy-security';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== (process.env.PUBLIC_SITE_URL ?? new URL(request.url).origin)) return new Response(null, { status: 403 });
  const body = await limitedBody(request, 1024);
  if (body === null) return new Response(null, { status: 413 });
  try {
    const result = await fetch(backendUrl('/analytics/visit'), {
      method: 'POST', headers: { ...clientHeaders(request, '/analytics/visit'), 'Content-Type': 'application/json', Origin: origin }, body,
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    return new Response(null, { status: result.ok ? 204 : result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return new Response(null, { status: 503 }); }
}
