-- Email logs table for tracking email dispatch status and enabling retries
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient TEXT NOT NULL,
  email_type TEXT NOT NULL,
  registration_id UUID REFERENCES registrations(id),
  group_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
