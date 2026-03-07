-- ============================================================
-- Phase 2: Motels, Rooms, Beds + Lodging Assignments
-- ============================================================

-- ─── Motels (buildings / properties) ───
CREATE TABLE motels (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  address     TEXT,
  total_rooms INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_motels_event_id ON motels(event_id);

-- ─── Rooms ───
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  motel_id    UUID NOT NULL REFERENCES motels(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  room_type   TEXT NOT NULL DEFAULT 'standard'
    CHECK (room_type IN ('standard', 'double', 'suite', 'accessible')),
  capacity    INTEGER NOT NULL DEFAULT 2,
  floor       INTEGER,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (motel_id, room_number)
);

CREATE INDEX idx_rooms_motel_id ON rooms(motel_id);

-- ─── Beds (individual sleeping spots within a room) ───
CREATE TABLE beds (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  bed_label   TEXT NOT NULL,
  bed_type    TEXT NOT NULL DEFAULT 'single'
    CHECK (bed_type IN ('single', 'double', 'bunk_top', 'bunk_bottom', 'queen', 'king', 'floor')),
  is_occupied BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, bed_label)
);

CREATE INDEX idx_beds_room_id ON beds(room_id);

-- ─── Lodging assignments (links a registration to a bed) ───
CREATE TABLE lodging_assignments (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  bed_id          UUID NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
  check_in_date   DATE,
  check_out_date  DATE,
  assigned_by     UUID REFERENCES profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registration_id),
  UNIQUE (bed_id)
);

CREATE INDEX idx_lodging_assignments_bed_id ON lodging_assignments(bed_id);
CREATE INDEX idx_lodging_assignments_registration_id ON lodging_assignments(registration_id);

-- ─── Lodging fee on pricing_config ───
ALTER TABLE pricing_config
  ADD COLUMN lodging_fee NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN pricing_config.lodging_fee IS 'Per-person lodging fee for motel stay. Added on top of conference registration fee.';

-- ─── Draft registration: add completion_token for secure completion links ───
ALTER TABLE registrations
  ADD COLUMN completion_token UUID DEFAULT NULL;

COMMENT ON COLUMN registrations.completion_token IS 'Secure token for invited/draft registrations to complete their registration via a unique link.';

CREATE UNIQUE INDEX idx_registrations_completion_token
  ON registrations(completion_token)
  WHERE completion_token IS NOT NULL;

-- ─── RLS Policies ───

-- Motels: public read, admin write
ALTER TABLE motels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read motels"
  ON motels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage motels"
  ON motels FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

-- Rooms: public read, admin write
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read rooms"
  ON rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage rooms"
  ON rooms FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

-- Beds: public read, admin write
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read beds"
  ON beds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage beds"
  ON beds FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

-- Lodging assignments: public read own, admin write
ALTER TABLE lodging_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read own lodging"
  ON lodging_assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage lodging assignments"
  ON lodging_assignments FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

-- ─── Updated_at triggers ───
CREATE TRIGGER update_motels_updated_at
  BEFORE UPDATE ON motels
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_beds_updated_at
  BEFORE UPDATE ON beds
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_lodging_assignments_updated_at
  BEFORE UPDATE ON lodging_assignments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
