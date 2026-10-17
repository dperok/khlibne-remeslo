# Deploy to Vercel

This repository contains a Next.js frontend and NestJS backend. `vercel.json` uses **Vercel Services (beta)** to deploy both from one repository and one project. Select the repository root (`.`), not `frontend`, when importing it. Let the checked-in service configuration control installation/build settings. Node.js 22+ is required.

The production project is `kr-kh/khlibne-remeslo`, at https://khlibne-remeslo.vercel.app. Local CLI linking is stored in ignored `.vercel/`. Until a GitHub Login Connection is added to this Vercel account and the private repository is connected, deploy reviewed commits with `vercel deploy --prod --scope kr-kh`; a Git push alone does not deploy the site.

Keep the backend service's `outputDirectory` set to `.`. Vercel Services otherwise flattens the Nest build output and loses the ESM package/dependency layout. The source entrypoint remains `src/main.ts`; the Nest build command checks the TypeScript application before Vercel packages it. Next.js catalogue/database handlers and homepage content explicitly wait for a runtime connection, because the backend service binding is unavailable during prerendering.

The frontend calls NestJS through a private `BACKEND_URL` service binding. **Do not set BACKEND_URL manually on Vercel.** Public website/API requests stay in Next.js; only `/telegram/*` is routed directly to NestJS. The public hostname must allow Telegram requests without a Vercel login page.

## Environment variables

Configure these in the Vercel project before deployment (server-side only; no `NEXT_PUBLIC_` prefix):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Existing Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Existing direct connection, used by local migration scripts only |
| `ADMIN_PASSWORD` | A long unique password; replace temporary `3722` |
| `ADMIN_SESSION_SECRET` | Random secret, at least 32 characters |
| `PUBLIC_SITE_URL` | Exact production origin, e.g. `https://your-project.vercel.app`, without trailing slash |
| `TELEGRAM_USER_BOT_TOKEN` | Visitor bot token |
| `TELEGRAM_ADMIN_BOT_TOKEN` | Administrator bot token |
| `TELEGRAM_ADMIN_IDS` | `470334534,5711475783` |
| `TELEGRAM_USER_WEBHOOK_SECRET` | Independent random 32–256 character secret, letters/digits/underscore/hyphen |
| `TELEGRAM_ADMIN_WEBHOOK_SECRET` | Another independent secret with the same requirements |
| `CRON_SECRET` | Independent random secret, at least 32 characters |

Generate each random secret separately with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep real values in local ignored env files or Vercel settings. Do not commit them.

`VERCEL` automatically selects webhook mode and disables polling. Locally, `npm start` keeps polling unless `TELEGRAM_MODE=webhook` is explicitly set. The webhook status displayed by the admin panel means the transport is enabled; use the check command below to verify registration at Telegram.

Use production tokens only in the Production environment. Preview builds must never replace the live webhooks. Preview admin access additionally needs `ADMIN_SESSION_SECRET` and a `PUBLIC_SITE_URL` matching that preview's origin. The runtime binding is not available during build; the homepage loads content at request time.

## Database and launch

1. Run `npm ci`, `npm ci --prefix frontend`, and `npm ci --prefix backend` from a normal Node.js installation. The checked-in `npm.cmd` is a local workspace helper; it is not needed on Vercel.
2. Run `npm --prefix backend run build`, then `npm run db:migrate` against the existing Neon database. Migrations preserve catalogue/contact data. Migration `005_serverless_runtime.sql` adds shared admin sessions, login throttling and webhook update IDs. Do not recreate or reseed the live catalogue.
3. Import the private GitHub repository into Vercel with Root Directory `.`. Add variables and deploy. Services is beta and may need enabling on the account.
4. Check `/`, `/admin`, `/api/catalog` and `/api/database`. Test login, catalogue edits, availability and analytics. Sessions are stored in Neon and survive new function instances. Changing the admin password or session secret invalidates existing sessions.
5. Set the final `PUBLIC_SITE_URL` and redeploy if the hostname changed. Set the same site URL, bot tokens and webhook secrets in your ignored local env file for the next command.
6. Stop the local polling server, then run `npm run telegram:webhooks -- --set`. This changes both bots to the production webhook endpoints and preserves queued updates. **Do not run this until the public deployment is working.**
7. Run `npm run telegram:webhooks -- --check`. Test `/start`, `/contacts`, `/support`, both admins' reply buttons and the shared answered status in Telegram. This final live check needs the deployed domain.

The daily Vercel cron retries pending support deliveries and cleans expired runtime records. Pending delivery/status notifications are also retried on incoming webhook traffic. A blocked administrator is retried when they unblock/start the bot. There is no permanent background process on Vercel.

Webhook requests require the Telegram secret header. Updates are serialized per bot/chat and successful update IDs are persisted, including across cold starts. As with any external messaging API, a crash between sending a Telegram message and recording the result can still result in a retry; this is not an exactly-once delivery guarantee.

## Poster availability

Set `POSTER_API_TOKEN` to the existing personal integration key in Production. Optional `POSTER_STORAGE_ID` selects one warehouse; otherwise totals across all warehouses are used. The backend makes only GET requests to the fixed `menu.getProducts` and `storage.getStorageLeftovers` endpoints, including zero balances. It matches catalogue Poster IDs to menu IDs, then uses their ingredient IDs to find stock. A stock above zero enables availability; zero or negative disables it. Missing/untracked records and manual overrides are preserved. Prices, product details and Poster itself are not modified.

Migration `007_poster_sync.sql` persists the last successful sync, counts and a sanitized last error. API failures retain the previous catalogue. A transaction lock prevents overlapping runs. The protected daily cron `/poster/sync` runs at 05:00 UTC (Hobby scheduling may be delayed within that hour); use the authenticated admin button for an immediate refresh. In each product, choose «Вручну» to override availability or «Автоматично з Poster» to resume synchronization.

## Return to local polling

Run `npm run telegram:webhooks -- --delete`, remove `TELEGRAM_MODE=webhook` locally, then start the local server. Avoid running multiple polling instances for the same bot. This does not delete queued messages.

## References

- https://vercel.com/docs/services
- https://vercel.com/docs/services/bindings
- https://vercel.com/docs/frameworks/backend/nestjs
- https://core.telegram.org/bots/api#setwebhook

### Наявність, графік і сповіщення
- На вітрині доступний фільтр «Тільки в наявності»; пошук і категорії працюють разом із ним.
- Графік редагується в «Контакти й адреса» окремо для кожного дня, часовий пояс Europe/Kyiv. До налаштування графік і статус не відображаються. Зачинення наступного дня підтримується.
- Помилка синхронізації Poster надсилається кожному TELEGRAM_ADMIN_IDS через адмін-бота; повторення не частіше ніж раз на 6 годин для кожного адміністратора. Успішна синхронізація скидає обмеження для наступного інциденту. Недоставлені сповіщення повторюються при наступній невдалій синхронізації. Текст не містить ключів або відповідей API.
- Перед деплоєм застосуйте міграцію 008_poster_alerts.sql через npm run db:migrate.
