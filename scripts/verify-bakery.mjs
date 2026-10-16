import assert from 'node:assert/strict';

async function json(path) {
  const response = await fetch(`http://127.0.0.1:3001${path}`);
  assert.equal(response.status, 200);
  return response.json();
}
const catalog = await json('/catalog');
assert.equal(catalog.demo, true);
assert.equal(catalog.products.length, 6);
for (const category of ['bread', 'pastry', 'sweet']) {
  const result = await json(`/catalog?category=${category}`);
  assert.ok(result.products.length > 0);
  assert.ok(result.products.every((product) => product.category === category));
}
const search = await json(`/catalog?q=${encodeURIComponent('КРУАСАН')}`);
assert.ok(search.products.some((product) => product.id === 'butter-croissant'));
assert.equal((await json('/catalog?q=nonexistent')).total, 0);
console.log('PASS NestJS catalogue: 6 demo products; category filters, Ukrainian search, empty results');
const bakery = await json('/bakery');
assert.equal(bakery.address, 'вул. Шевченка, 167');
assert.equal(bakery.phone, null);
assert.match(bakery.mapsUrl, /google.com\/maps/);
console.log('PASS NestJS bakery: verified Kharkiv address; contacts left empty');
for (const product of catalog.products) {
  const response = await fetch(`http://127.0.0.1:3000${product.image}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image/);
}
console.log('PASS all six catalogue photos load');
const proxy = await fetch('http://127.0.0.1:3000/api/catalog?category=sweet');
assert.equal(proxy.status, 200);
assert.equal((await proxy.json()).products[0].id, 'sweet-bun');
const home = await fetch('http://127.0.0.1:3000');
assert.equal(home.status, 200);
const html = await home.text();
assert.match(html, /lang="uk"/);
assert.match(html, /Хлібне ремесло/);
assert.match(html, /вул. Шевченка, 167/);
assert.match(html, /Хліб із насінням/);
console.log('PASS Next.js homepage: Ukrainian, server-rendered catalogue and address; API proxy works');
