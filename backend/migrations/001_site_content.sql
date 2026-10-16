CREATE TABLE IF NOT EXISTS bakery_site_content (
  id smallint PRIMARY KEY CHECK (id = 1),
  content jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
