import { Suspense } from 'react';
import BakerySite, { type Bakery, type Product } from './bakery-site';
import { backendUrl } from './backend-url';

async function loadBakeryData() {
  try {
    const responses = await Promise.all([
      fetch(backendUrl('/catalog'), { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      fetch(backendUrl('/bakery'), { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error('Backend unavailable');
    const [catalog, bakery]: [{ products: Product[]; demo: boolean }, Bakery] = await Promise.all([responses[0].json(), responses[1].json()]);
    return { products: catalog.products, bakery, demo: catalog.demo };
  } catch {
    return null;
  }
}

async function BakeryContent() {
  const data = await loadBakeryData();
  if (!data) return <main className="unavailable"><span>Хлібне ремесло</span><h1>Наша вітрина скоро повернеться.</h1><p>Не вдалося завантажити каталог. Оновіть сторінку трохи пізніше.</p></main>;
  return <BakerySite products={data.products} bakery={data.bakery} demo={data.demo} />;
}

export default function Home() {
  return <Suspense fallback={<main className="unavailable"><span>Хлібне ремесло</span><h1>Готуємо нашу вітрину…</h1></main>}><BakeryContent /></Suspense>;
}
