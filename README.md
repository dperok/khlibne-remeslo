# Site

Vercel deployment: see [DEPLOYMENT.md](DEPLOYMENT.md). Both bots support authenticated webhooks; local polling remains available.

## Хлібне ремесло

### Admin panel and Telegram bots

The **Відвідуваність** tab shows daily unique browsers, visits and average active time,
plus seven daily rows. Dates use `Europe/Kyiv`. The anonymous visitor identifier is random
and stored in the browser; only its SHA-256 hash is saved in Neon. Admin pages do not
mount the tracker. Visibility/focus events and a 15-second heartbeat measure active time;
background tabs and more than 60 seconds of inactivity are excluded. The browser's native
`sendBeacon` sends the last update when the tab is hidden or the page component unmounts.
This is approximate analytics, not a verified count of people: storage clearing, multiple
devices, blockers and lost events affect results. Heartbeats are cumulative and monotonic,
so retrying an event does not add its time again. Raw visit rows expire after 90 days.
Schema is in `backend/migrations/002_site_analytics.sql`; use `npm run db:migrate` to apply it.
Run `node backend/scripts/verify-analytics.mjs` with both servers running to test and then
clean up dedicated test visits. Reports require the existing admin session.

Bot profiles shown in the admin panel:
- Visitor bot: https://t.me/Khlibne_remeslo_kh_bot
- Admin bot: https://t.me/iehngtvjmrrbot

The administrative bot silently ignores unauthorized senders and group messages.

Visitor catalogue and address are available on the website. Retired bot commands link
to the corresponding website section. The bot keeps contacts and support.

Visitor `/support` or **💬 Зв’язатися** waits up to 30 minutes for one text message;
`/cancel` cancels it, and successful submission automatically exits support mode.
The message is saved in Neon and delivered through the
admin bot to every ID in `TELEGRAM_ADMIN_IDS`, with a **Відповісти** inline button.
An authorized administrator presses that button and replies to the bot's ForceReply
prompt. The reply returns to the visitor through the visitor bot. Reply prompts are
scoped to the administrator and expire after 24 hours; `/cancel` invalidates that admin's
outstanding prompts. Each administrator must first press **Start** in the admin bot:
Telegram cannot initiate a chat with somebody who has never started it or has blocked it.
Pending deliveries remain in Neon and are retried by local polling, webhook traffic,
and the protected Vercel cron. Successful replies close the admin's reply mode and
mark the original message as answered for both administrators.
Correspondence and routing survive application restarts. Text messages are supported;
attachments receive a request to describe the issue in text. No messages outside explicit
support mode are relayed. Apply `003_telegram_support.sql` using `npm run db:migrate`.

Open `/admin`. The administrator password is configured only in the gitignored root
`.env` as `ADMIN_PASSWORD`. Use a strong unique value and configure it separately in
Vercel's environment variables. Restart the backend after a change; changing the
password invalidates existing sessions.
The panel also keeps a visible reminder while the temporary password is in use.
Login uses an 8-hour HttpOnly/SameSite=Strict session cookie, origin checks for writes,
and a 5-failed-attempt / 15-minute login limit. Sessions and failed attempts are stored
in Neon and shared across backend instances. Apply `005_serverless_runtime.sql`.

The panel can add, edit, hide/show and delete products, and change contacts and address.
Changes are saved in the existing Neon database (`bakery_site_content`), shared with
the public site and both bots. Schema is tracked in `backend/migrations/001_site_content.sql`.
For a fresh database, build the backend, then run:

    .\npm.cmd run db:migrate

The migration uses `DATABASE_URL_UNPOOLED`, seeds demo content only when the singleton
row is absent, and preserves existing content on reruns. Application queries use pooled
`DATABASE_URL`. Back up the database before removing real products.

Root `.env` contains these placeholders (also documented in `.env.example`):

    TELEGRAM_USER_BOT_TOKEN=
    TELEGRAM_ADMIN_BOT_TOKEN=
    TELEGRAM_ADMIN_IDS=470334534,5711475783
    PUBLIC_SITE_URL=http://localhost:3000

Create two distinct bots with Telegram BotFather and paste their tokens into those keys.
Restart `npm start` after changing configuration. Empty tokens disable the corresponding
bot without preventing the website from starting. Do not publish tokens in client-side
variables. No new Telegram accounts were registered by this implementation.

- Visitor bot: `/start`, `/help`, `/contacts`, `/support`, `/cancel`, `/site`, plus a keyboard.
- Admin bot: `/status`, `/products`, `/hide ID`, `/show ID`, `/contact phone|email|instagram value`,
  `/panel`. A contact value of `-` clears the field. Administrative access requires both
  an allowed sender ID and a private chat; knowing a chat ID alone grants no access.
- Locally the bots use Telegram `getUpdates` long polling while the NestJS server is running.
  Run exactly one instance per token. Existing webhooks are preserved; if one exists,
  polling is paused and the admin panel reports it. Invalid tokens and polling conflicts
  are reported without exposing tokens in logs.
- On Vercel both bots use authenticated webhooks; there is no polling loop. Setup and
  registration commands are in [DEPLOYMENT.md](DEPLOYMENT.md).
- For public hosting set `PUBLIC_SITE_URL` to the real HTTPS origin with no trailing slash;
  this also enables Secure session cookies. The local URL is only for local testing.

Checks with both servers running:

    .\npm.cmd run verify:admin
    node scripts/verify-bakery.mjs

`verify:admin` creates and removes a dedicated test product and briefly changes then
restores the contact email to prove persistence and public rendering. Bot commands,
allowlist rejection and Telegram polling are tested with mocked Telegram responses;
real Telegram delivery requires the user's tokens.

Ukrainian bakery showcase built with Next.js and NestJS. No cart, checkout, or online ordering.
NestJS serves `/catalog` (optional `category` and `q`) and `/bakery`; Next.js renders their data.
The catalogue is illustrative; `backend/src/catalog.data.ts` provides the initial seed,
and the admin panel edits the persistent content in Neon.
Phone, Instagram, and email are intentionally empty until supplied by the owner.
Address verified on Google Maps: Kharkiv, Shevchenka Street 167, CID 10178684025899548076.
Run `node scripts/verify-bakery.mjs` with both servers running to check the integration.

Demo photo sources (Unsplash, locally stored in `frontend/public/images`):
- Bread: https://images.unsplash.com/photo-1509440159596-0249088772ff
- Sliced bread: https://images.unsplash.com/photo-1549931319-a545dcf3bc73
- Croissants: https://images.unsplash.com/photo-1555507036-ab1f4038808a
- Pastry basket: https://images.unsplash.com/photo-1530610476181-d83430b64dcd
- Toast serving: https://images.unsplash.com/photo-1484723091739-30a097e8f929
- Cinnamon buns: https://images.unsplash.com/photo-1509365465985-25d11c17e812

Next.js: frontend, http://localhost:3000
NestJS: backend, http://localhost:3001

Start in two PowerShell terminals from this folder:

    .\npm.cmd run dev:frontend
    .\npm.cmd run dev:backend

Build both applications:

    .\npm.cmd run build

A local npm is provided in .tools because npm was absent from PATH.

## Neon Postgres

Linked project: `crimson-band-41671189`, organization `org-mute-mud-95309050`, branch `production`.
`neon.ts` declares the Postgres setup. `neon deploy` reconciles it and pulls credentials
into the gitignored root `.env.local` (or `.env` when present). Never commit those files.

NestJS reads the root environment file and uses `DATABASE_URL` with a reusable `pg`
pool (maximum 5 connections). `DATABASE_URL_UNPOOLED` is reserved for future migrations.
No tables or production records are created by the connection check.

After building, start both production servers:

    .\npm.cmd start

Open http://localhost:3000/database and click **Check database**.
The request goes through Next.js `/api/database`, NestJS `/database/status`, and a
parameterized, read-only Postgres query that returns the request probe and database time.
Credentials remain on the backend. Failed connections return HTTP 503.

With both servers running, repeat the automated live checks:

    .\npm.cmd run verify:neon

For separate hosting, set server-side `BACKEND_URL` for Next.js to the NestJS base URL.
Supply `DATABASE_URL` securely to the backend host. Neon deploy provisions backend
services; it does not publish these application servers or the Next.js frontend.

### Pickup orders

The cart and recent order receipts persist in this browser. Checkout snapshots current
server prices and availability into Neon (`012_orders.sql`); no payment gateway is
connected and every order remains `unpaid` for payment on pickup. The request UUID
deduplicates retries. Each receipt has a random cancellation capability; only its hash
is stored in the database. Clearing browser storage loses access to those receipts.
Admin sessions protect `/admin/orders`. Cancelled orders are retained in the database
but omitted from the admin list; completed orders cannot be cancelled.

`node backend/scripts/test-orders.mjs` exercises creation, retries and cancellation
in temporary SQL tables inside a rolled-back transaction without changing live rows.

