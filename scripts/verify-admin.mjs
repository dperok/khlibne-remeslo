import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const base = 'http://localhost:3000/api/admin/';
const origin = 'http://localhost:3000';
let cookie = '';
async function call(path, method = 'GET', body, expected = 200, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { Origin: origin, ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, expected, `${method} ${path}: ${await response.clone().text()}`);
  return response;
}
await call('content', 'GET', undefined, 401, false);
await call('products', 'POST', {}, 401, false);
const login = await call('login', 'POST', { password: process.env.ADMIN_PASSWORD }, 201, false);
assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
cookie = login.headers.get('set-cookie').split(';')[0];
const state = await (await call('content')).json();
for (const role of ['user', 'admin']) assert.equal(typeof state.bots[role], 'string');
console.log('PASS admin access: unauthorized requests blocked; HttpOnly session established; bot statuses available');
let created;
let contactsChanged = false;
try {
  created = await (await call('products', 'POST', { name: 'Перевірка адмін-панелі', category: 'bread', image: '/images/bread.jpg', description: 'Тимчасовий тестовий товар.', ingredients: 'Борошно', allergens: 'Глютен', tag: 'Перевірка', visible: false }, 201)).json();
  let catalog = await (await fetch('http://localhost:3001/catalog')).json();
  assert.ok(!catalog.products.some((product) => product.id === created.id));
  await call(`products/${created.id}`, 'PUT', { ...created, visible: true });
  catalog = await (await fetch('http://localhost:3001/catalog')).json();
  assert.ok(catalog.products.some((product) => product.id === created.id));
  console.log('PASS Neon product CRUD: create, read, update, public visibility');
  await call('bakery', 'PUT', { ...state.bakery, email: 'admin-verification@example.invalid' });
  contactsChanged = true;
  const html = await (await fetch('http://localhost:3000')).text();
  assert.match(html, /mailto:admin-verification@example.invalid/);
  assert.doesNotMatch(html, /Адресу перевірено в Google Maps/);
  console.log('PASS contacts: admin update persisted in Neon and rendered on public site; address note removed');
  const csrf = await fetch(base + `products/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie, Origin: 'https://evil.example' } });
  assert.equal(csrf.status, 403);
  console.log('PASS cross-origin mutation denied');
} finally {
  if (contactsChanged) await call('bakery', 'PUT', state.bakery);
  if (created) await call(`products/${created.id}`, 'DELETE');
}
await call('logout', 'POST', {} ,201);
await call('content', 'GET', undefined, 401);
console.log('PASS cleanup: temporary test product deleted, contacts restored, session revoked');
