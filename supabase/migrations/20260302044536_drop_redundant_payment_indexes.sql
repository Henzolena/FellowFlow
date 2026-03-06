-- Drop redundant non-unique indexes that are already covered by UNIQUE constraint indexes
DROP INDEX IF EXISTS idx_payments_stripe_session;
DROP INDEX IF EXISTS idx_payments_stripe_event_id;
