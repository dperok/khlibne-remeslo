CREATE TABLE IF NOT EXISTS bakery_poster_alerts (
  admin_id bigint PRIMARY KEY,
  last_sent_at timestamptz NOT NULL
);
