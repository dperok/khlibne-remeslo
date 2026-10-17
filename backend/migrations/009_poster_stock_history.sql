CREATE TABLE IF NOT EXISTS bakery_poster_stock_history (
  stock_key text PRIMARY KEY,
  quantity numeric NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_changed_at timestamptz,
  last_observed_at timestamptz NOT NULL
);
