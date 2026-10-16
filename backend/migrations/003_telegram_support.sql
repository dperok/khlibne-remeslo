UPDATE bakery_site_content
SET content = jsonb_set(content, '{bakery}', (content->'bakery') || '{"latitude":50.0025971,"longitude":36.2705935}'::jsonb)
WHERE id = 1 AND NOT (content->'bakery' ? 'latitude')
  AND content->'bakery'->>'address' = 'вул. Шевченка, 167';

CREATE TABLE IF NOT EXISTS bakery_support_modes (
  user_id bigint PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS bakery_support_messages (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  sender_name text NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_message_id)
);
CREATE TABLE IF NOT EXISTS bakery_support_deliveries (
  ticket_id uuid NOT NULL REFERENCES bakery_support_messages(id) ON DELETE CASCADE,
  admin_id bigint NOT NULL,
  message_id bigint,
  PRIMARY KEY(ticket_id, admin_id)
);
CREATE TABLE IF NOT EXISTS bakery_support_prompts (
  admin_id bigint NOT NULL,
  prompt_id bigint NOT NULL,
  ticket_id uuid NOT NULL REFERENCES bakery_support_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(admin_id, prompt_id)
);
CREATE TABLE IF NOT EXISTS bakery_support_replies (
  admin_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  ticket_id uuid NOT NULL REFERENCES bakery_support_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(admin_id, source_message_id)
);
