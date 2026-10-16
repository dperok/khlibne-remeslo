import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { kyivDay } from '../dist/analytics.service.js';

config({ path: ['.env.local', '.env'], quiet: true });
const origin = 'http://localhost:3000';
const day = kyivDay();
const visitors = [randomUUID(), randomUUID()];
const sessions = [randomUUID(), randomUUID(), randomUUID()];
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: dbUrl.toString() });
let cookie;
async function track(visitorId, sessionId, activeMs) {
  const response = await fetch(`${origin}/api/analytics`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ day, visitorId, sessionId, activeMs }) });
  assert.equal(response.status, 204);
}
try {
  await client.connect();
  const unauth = await fetch(`${origin}/api/admin/analytics`);
  assert.equal(unauth.status, 401);
  await track(visitors[0], sessions[0], 0);
  await track(visitors[0], sessions[0], 1200);
  await track(visitors[0], sessions[0], 1200);
  await track(visitors[0], sessions[0], 100);
  await track(visitors[0], sessions[1], 700);
  await track(visitors[1], sessions[2], 400);
  const result = await client.query(`SELECT count(DISTINCT visitor_hash)::int AS visitors, count(*)::int AS sessions,
    sum(active_ms)::int AS active_ms FROM bakery_site_visits WHERE day = $1 AND session_id = ANY($2::uuid[])`, [day, sessions]);
  assert.deepEqual(result.rows[0], { visitors: 2, sessions: 3, active_ms: 2300 });
  console.log('PASS analytics persistence: 2 unique browsers, 3 visits; duplicate/out-of-order updates do not inflate active time');
  const forbidden = await fetch(`${origin}/api/analytics`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const login = await fetch(`${origin}/api/admin/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 201);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${origin}/api/admin/analytics`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.timezone, 'Europe/Kyiv');
  assert.equal(data.days.length, 7);
  assert.equal(data.today.day, day);
  assert.ok(data.today.visitors >= 2 && data.today.sessions >= 3);
  const botResponse = await fetch(`${origin}/api/admin/content`, { headers: { Cookie: cookie } });
  const content = await botResponse.json();
  console.log('PASS private analytics: seven days in Kyiv timezone; anonymous access and foreign origins blocked');
  console.log('Telegram runtime statuses:', JSON.stringify(content.bots));
} finally {
  await client.query('DELETE FROM bakery_site_visits WHERE session_id = ANY($1::uuid[])', [sessions]).catch(() => {});
  await client.end();
  if (cookie) await fetch(`${origin}/api/admin/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  console.log('Analytics test visits cleaned up');
}
