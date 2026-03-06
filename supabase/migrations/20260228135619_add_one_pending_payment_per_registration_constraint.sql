-- Ensure only one pending payment per registration at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_payment_per_registration
  ON payments (registration_id)
  WHERE status = 'pending';
