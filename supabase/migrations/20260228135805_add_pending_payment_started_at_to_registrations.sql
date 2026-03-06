-- Track when a Stripe checkout session was created for orphan detection
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS pending_payment_started_at TIMESTAMPTZ;
