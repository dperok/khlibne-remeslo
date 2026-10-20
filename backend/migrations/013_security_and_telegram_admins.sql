CREATE TABLE IF NOT EXISTS bakery_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS bakery_rate_limits_expiry ON bakery_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS bakery_telegram_admins (
  user_id bigint PRIMARY KEY CHECK (user_id > 0 AND user_id <= 9007199254740991),
  added_by bigint NOT NULL CHECK (added_by IN (470334534,5711475783)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bakery_support_user_age ON bakery_support_messages(user_id,created_at);
CREATE INDEX IF NOT EXISTS bakery_support_message_age ON bakery_support_messages(created_at);
CREATE TABLE IF NOT EXISTS bakery_telegram_leases (
  key text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
