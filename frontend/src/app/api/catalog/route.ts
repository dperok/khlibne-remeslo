export async function GET(request: Request) {
  const url = new URL('/catalog', process.env.BACKEND_URL ?? 'http://127.0.0.1:3001');
  const search = new URL(request.url).searchParams;
  for (const key of ['category', 'q']) {
    const value = search.get(key);
    if (value) url.searchParams.set(key, value);
  }
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Catalogue unavailable');
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: 'Не вдалося завантажити каталог. Спробуйте ще раз.' }, { status: 503 });
  }
}
