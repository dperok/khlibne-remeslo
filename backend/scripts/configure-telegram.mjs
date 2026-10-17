import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });
const action = process.argv[2];
if (!['--set', '--check', '--delete'].includes(action)) throw new Error('Use --check, --set, or --delete explicitly');
const site = new URL(process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000');
if (action === '--set' && (site.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(site.hostname))) throw new Error('PUBLIC_SITE_URL must be the public production HTTPS origin');
async function call(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed (${data.error_code ?? response.status})`);
  return data.result;
}
const roles = ['user', 'admin'];
if (process.env.TELEGRAM_USER_BOT_TOKEN === process.env.TELEGRAM_ADMIN_BOT_TOKEN) throw new Error('The bots must use different tokens');
for (const role of roles) {
  if (!process.env[`TELEGRAM_${role.toUpperCase()}_BOT_TOKEN`]) throw new Error(`${role} bot token is missing`);
  const secret = process.env[`TELEGRAM_${role.toUpperCase()}_WEBHOOK_SECRET`];
  if (action === '--set' && (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret))) throw new Error(`${role} webhook secret must be 32–256 letters, digits, underscores or hyphens`);
}
// An empty update is rejected before any DB mutation. Check both endpoints before
// switching either live bot away from polling.
if (action === '--set') for (const role of roles) {
  const response = await fetch(new URL(`/telegram/${role}`, site), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': process.env[`TELEGRAM_${role.toUpperCase()}_WEBHOOK_SECRET`] }, body: '{}', signal: AbortSignal.timeout(30000) });
  if (response.status !== 400 || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`${role} webhook endpoint is not ready; deploy and check secrets first`);
}
for (const role of roles) {
  const token = process.env[`TELEGRAM_${role.toUpperCase()}_BOT_TOKEN`];
  const secret = process.env[`TELEGRAM_${role.toUpperCase()}_WEBHOOK_SECRET`];
  if (!token) throw new Error(`${role} bot token is missing`);
  if (action === '--set') {
    if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error(`${role} webhook secret must be 32–256 letters, digits, underscores or hyphens`);
    await call(token, 'setWebhook', { url: new URL(`/telegram/${role}`, site).href, secret_token: secret, allowed_updates: ['message', 'callback_query'], max_connections: 2, drop_pending_updates: false });
    console.log(`PASS ${role}: webhook configured`);
  } else if (action === '--delete') {
    await call(token, 'deleteWebhook', { drop_pending_updates: false });
    console.log(`PASS ${role}: webhook removed; local polling may be started`);
  }
  const info = await call(token, 'getWebhookInfo', {});
  console.log(`${role}: ${info.url ? 'webhook active' : 'polling mode'}, pending updates: ${info.pending_update_count}, delivery error: ${info.last_error_date ? 'yes' : 'no'}`);
}
