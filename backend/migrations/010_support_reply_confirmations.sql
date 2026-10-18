CREATE TABLE IF NOT EXISTS bakery_support_reply_confirmations (
  id uuid PRIMARY KEY,
  admin_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  ticket_id uuid NOT NULL REFERENCES bakery_support_messages(id) ON DELETE CASCADE,
  message_text text NOT NULL,
  prompt_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_id,source_message_id)
);
