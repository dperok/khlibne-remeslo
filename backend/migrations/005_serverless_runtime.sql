CREATE TABLE IF NOT EXISTS bakery_admin_sessions (
  token_hash text PRIMARY KEY,
  password_version text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS bakery_admin_failures (
  ip_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS bakery_telegram_updates (
  role text NOT NULL,
  update_id bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(role, update_id)
);
CREATE INDEX IF NOT EXISTS bakery_telegram_updates_age ON bakery_telegram_updates(processed_at);
