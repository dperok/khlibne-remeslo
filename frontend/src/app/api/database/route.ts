export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get("probe") ?? crypto.randomUUID();
  const url = new URL("/database/status", process.env.BACKEND_URL ?? "http://127.0.0.1:3001");
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
