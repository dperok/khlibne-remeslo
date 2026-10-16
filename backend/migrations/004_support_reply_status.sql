ALTER TABLE bakery_support_deliveries ADD COLUMN IF NOT EXISTS reply_status_notified boolean NOT NULL DEFAULT false;
