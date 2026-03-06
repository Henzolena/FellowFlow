-- Add retry tracking columns to email_logs for durable email delivery
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;

COMMENT ON COLUMN email_logs.retry_count IS 'Number of retry attempts for failed emails';
COMMENT ON COLUMN email_logs.last_retry_at IS 'Timestamp of the most recent retry attempt';

-- Partial index for efficiently querying retryable failed emails
CREATE INDEX IF NOT EXISTS idx_email_logs_retryable
  ON email_logs (created_at)
  WHERE status = 'failed' AND retry_count < 3;
