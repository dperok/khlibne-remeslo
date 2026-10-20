import { backendUrl } from '../../backend-url';
import { connection } from 'next/server';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return new Response(null, { status: 404 });
  await connection();
  const probe = new URL(request.url).searchParams.get("probe") ?? crypto.randomUUID();
  const url = backendUrl('/database/status');
  url.searchParams.set("probe", probe);
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return Response.json({ error: "Database is unavailable" }, { status: 503 });
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Backend is unavailable" }, { status: 503 });
  }
}
