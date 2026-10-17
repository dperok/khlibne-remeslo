CREATE TABLE IF NOT EXISTS bakery_poster_sync (
  id integer PRIMARY KEY CHECK (id = 1),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  summary jsonb
);
INSERT INTO bakery_poster_sync(id) VALUES(1) ON CONFLICT DO NOTHING;
