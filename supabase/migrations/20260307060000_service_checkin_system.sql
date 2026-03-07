-- =============================================================
-- Service Check-In System: catalog, entitlements, usage logs
-- =============================================================

-- 1. Service Catalog — admin-defined services per event
CREATE TABLE IF NOT EXISTS service_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service_name    TEXT NOT NULL,
  service_code    TEXT NOT NULL,
  service_category TEXT NOT NULL CHECK (service_category IN ('main_service', 'meal', 'custom')),
  meal_type       TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner') OR meal_type IS NULL),
  service_date    DATE,
  start_time      TIME,
  end_time        TIME,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  scan_limit_per_attendee INT NOT NULL DEFAULT 1,
  requires_payment BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_service_code_per_event UNIQUE (event_id, service_code)
);

CREATE INDEX idx_service_catalog_event ON service_catalog(event_id, is_active);
CREATE INDEX idx_service_catalog_date ON service_catalog(event_id, service_date, service_category);

-- 2. Service Entitlements — what each registrant can access
CREATE TABLE IF NOT EXISTS service_entitlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'blocked', 'waived', 'paid_extra')),
  quantity_allowed INT NOT NULL DEFAULT 1,
  quantity_used    INT NOT NULL DEFAULT 0,
  granted_by       UUID REFERENCES profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_entitlement_per_service UNIQUE (registration_id, service_id)
);

CREATE INDEX idx_entitlements_registration ON service_entitlements(registration_id);
CREATE INDEX idx_entitlements_service ON service_entitlements(service_id);

-- 3. Service Usage Logs — every scan creates a record
CREATE TABLE IF NOT EXISTS service_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  scanned_by      UUID REFERENCES profiles(id),
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  result          TEXT NOT NULL CHECK (result IN ('approved', 'denied', 'duplicate', 'not_entitled', 'blocked')),
  reason          TEXT,
  station_label   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_registration ON service_usage_logs(registration_id, service_id);
CREATE INDEX idx_usage_logs_service ON service_usage_logs(service_id, scanned_at);
CREATE INDEX idx_usage_logs_scanned_at ON service_usage_logs(scanned_at DESC);

-- RLS policies
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_usage_logs ENABLE ROW LEVEL SECURITY;

-- Public read for service catalog (staff/attendees can see services)
CREATE POLICY "Public read service catalog" ON service_catalog FOR SELECT USING (true);
CREATE POLICY "Auth write service catalog" ON service_catalog FOR ALL USING (auth.role() = 'authenticated');

-- Authenticated access for entitlements
CREATE POLICY "Auth read entitlements" ON service_entitlements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth write entitlements" ON service_entitlements FOR ALL USING (auth.role() = 'authenticated');

-- Authenticated access for usage logs
CREATE POLICY "Auth read usage logs" ON service_usage_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth write usage logs" ON service_usage_logs FOR ALL USING (auth.role() = 'authenticated');
