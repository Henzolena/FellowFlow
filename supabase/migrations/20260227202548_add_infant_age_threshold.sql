-- Add infant_age_threshold to events for free infant pricing
ALTER TABLE events ADD COLUMN IF NOT EXISTS infant_age_threshold integer NOT NULL DEFAULT 3;
COMMENT ON COLUMN events.infant_age_threshold IS 'Children at or below this age attend for free';
