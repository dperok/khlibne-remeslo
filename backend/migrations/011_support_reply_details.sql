ALTER TABLE bakery_support_replies ADD COLUMN IF NOT EXISTS message_text text;
ALTER TABLE bakery_support_replies ADD COLUMN IF NOT EXISTS admin_name text;
CREATE INDEX IF NOT EXISTS bakery_support_replies_latest_idx ON bakery_support_replies(ticket_id,created_at DESC,source_message_id DESC);
