// Service bindings can include a path prefix; preserve it when joining routes.
export function backendUrl(path: string): URL {
  const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
  if (process.env.VERCEL && !process.env.BACKEND_URL) throw new Error('BACKEND_URL service binding is missing');
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`);
}
