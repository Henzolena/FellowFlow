-- ============================================================
-- Phase 3: Check-ins, Wristband Colors, Staff Verification
-- ============================================================

-- ─── Wristband color mapping (stored as JSONB on events) ───
ALTER TABLE events
  ADD COLUMN wristband_config JSONB NOT NULL DEFAULT '[
    {"access_tier": "FULL_ACCESS",  "color": "Green",  "label": "Full Access"},
    {"access_tier": "KOTE_ACCESS",  "color": "Yellow", "label": "KOTE / Walk-in"},
    {"access_tier": "MOTEL_ACCESS", "color": "Blue",   "label": "Motel Guest"},
    {"access_tier": "MEAL_ACCESS",  "color": "Orange", "label": "Meal Only"},
    {"access_tier": "STAFF",        "color": "Red",    "label": "Staff"},
    {"access_tier": "VIP",          "color": "Purple", "label": "VIP"}
  ]'::jsonb;

COMMENT ON COLUMN events.wristband_config IS 'JSON array mapping access_tier to wristband color and label for check-in staff.';

-- ─── Check-ins table ───
CREATE TABLE check_ins (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  checked_in_by   UUID REFERENCES profiles(id),
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  wristband_color TEXT,
  access_tier     TEXT CHECK (access_tier IN ('FULL_ACCESS', 'KOTE_ACCESS', 'MOTEL_ACCESS', 'MEAL_ACCESS', 'STAFF', 'VIP')),
  method          TEXT NOT NULL DEFAULT 'qr_scan'
    CHECK (method IN ('qr_scan', 'manual', 'code_entry')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_check_ins_registration_id ON check_ins(registration_id);
CREATE INDEX idx_check_ins_event_id ON check_ins(event_id);
CREATE INDEX idx_check_ins_checked_in_at ON check_ins(checked_in_at);

-- Only one check-in per registration (prevent double check-in)
CREATE UNIQUE INDEX idx_one_checkin_per_registration
  ON check_ins(registration_id);

-- ─── Add checked_in flag to registrations for quick filtering ───
ALTER TABLE registrations
  ADD COLUMN checked_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN checked_in_at TIMESTAMPTZ;

-- ─── RLS ───
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read check_ins"
  ON check_ins FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin can manage check_ins"
  ON check_ins FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );
