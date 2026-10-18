CREATE TABLE IF NOT EXISTS bakery_orders (
  id uuid PRIMARY KEY,
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  items jsonb NOT NULL,
  total_kopecks integer NOT NULL CHECK (total_kopecks >= 0),
  pickup_address text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','ready','completed','cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status = 'unpaid'),
  token_hash text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bakery_orders_active ON bakery_orders (created_at DESC) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS bakery_orders_phone_time ON bakery_orders (phone, created_at DESC);
