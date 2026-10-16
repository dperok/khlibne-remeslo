CREATE TABLE IF NOT EXISTS bakery_site_visits (
  day date NOT NULL,
  session_id uuid NOT NULL,
  visitor_hash char(64) NOT NULL,
  active_ms integer NOT NULL DEFAULT 0 CHECK (active_ms BETWEEN 0 AND 86400000),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, session_id)
);
