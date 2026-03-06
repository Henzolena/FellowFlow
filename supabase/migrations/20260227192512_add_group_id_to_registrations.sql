-- Add group_id to registrations for multi-person group registration support
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_group_id ON registrations (group_id) WHERE group_id IS NOT NULL;
