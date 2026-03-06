-- Webhook failures table for logging and resolving failed webhook payloads
CREATE TABLE IF NOT EXISTS webhook_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT,
  event_type TEXT,
  session_id TEXT,
  registration_id UUID,
  failure_reason TEXT NOT NULL,
  payload JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;
