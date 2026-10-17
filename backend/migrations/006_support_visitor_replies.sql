CREATE TABLE IF NOT EXISTS bakery_support_visitor_answers (
  user_id bigint NOT NULL,
  message_id bigint NOT NULL,
  ticket_id uuid NOT NULL REFERENCES bakery_support_messages(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, message_id)
);
