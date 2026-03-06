-- Prevent duplicate active registrations for the same person at the same event
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_registration
  ON registrations (event_id, lower(email), lower(first_name), lower(last_name))
  WHERE status IN ('pending', 'confirmed');
