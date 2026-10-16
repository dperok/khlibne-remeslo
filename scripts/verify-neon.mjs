import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

for (const endpoint of ['http://127.0.0.1:3001/database/status', 'http://127.0.0.1:3000/api/database']) {
  const probe = randomUUID();
  const response = await fetch(`${endpoint}?probe=${probe}`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'connected');
  assert.equal(data.probe, probe);
  assert.ok(Number.isFinite(Date.parse(data.checkedAt)));
  console.log(`PASS ${endpoint} HTTP ${response.status} ${JSON.stringify(data)}`);
}
const page = await fetch('http://127.0.0.1:3000/database');
assert.equal(page.status, 200);
assert.match(await page.text(), /Check database/);
console.log('PASS /database UI HTTP 200');
