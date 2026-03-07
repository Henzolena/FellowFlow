-- ============================================================
-- Phase 1: Churches, KOTE, Registration Enhancements, Confirmation Codes
-- ============================================================

-- ============================================================
-- 1. Churches table
-- ============================================================
CREATE TABLE public.churches (
  id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name        TEXT NOT NULL,
  city        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT churches_name_unique UNIQUE (name)
);

ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "churches_public_read" ON public.churches
  FOR SELECT USING (true);

CREATE POLICY "churches_admin_insert" ON public.churches
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "churches_admin_update" ON public.churches
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "churches_admin_delete" ON public.churches
  FOR DELETE USING (public.is_super_admin());

CREATE TRIGGER trg_churches_updated_at
  BEFORE UPDATE ON public.churches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed common churches
INSERT INTO public.churches (name) VALUES
  ('Addis Kidan Baptist Church'),
  ('Berea Baptist Church'),
  ('Bethel Baptist Church'),
  ('Calvary Baptist Church'),
  ('Emmanuel Baptist Church'),
  ('Faith Baptist Church'),
  ('Grace Baptist Church'),
  ('Hope Baptist Church'),
  ('Liberty Baptist Church'),
  ('New Life Baptist Church'),
  ('Trinity Baptist Church'),
  ('Unity Baptist Church'),
  ('Victory Baptist Church'),
  ('Zion Baptist Church')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. Add kote_daily_price to pricing_config
-- ============================================================
ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS kote_daily_price NUMERIC NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.pricing_config.kote_daily_price IS
  'KOTE (walk-in / off-campus) daily fee per person. Default $10/day.';

-- ============================================================
-- 3. Add new columns to registrations
-- ============================================================
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS church_id UUID
    REFERENCES public.churches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS church_name_custom TEXT,
  ADD COLUMN IF NOT EXISTS attendance_type TEXT NOT NULL DEFAULT 'full_conference'
    CHECK (attendance_type IN ('full_conference', 'partial', 'kote')),
  ADD COLUMN IF NOT EXISTS public_confirmation_code TEXT,
  ADD COLUMN IF NOT EXISTS access_tier TEXT
    CHECK (access_tier IN ('FULL_ACCESS', 'KOTE_ACCESS', 'MOTEL_ACCESS', 'MEAL_ACCESS', 'STAFF', 'VIP'));

-- ============================================================
-- 4. Backfill attendance_type from is_full_duration for existing records
-- ============================================================
UPDATE public.registrations
SET attendance_type = CASE
  WHEN is_full_duration = true THEN 'full_conference'
  ELSE 'partial'
END
WHERE attendance_type = 'full_conference'
  AND is_full_duration = false;

-- ============================================================
-- 5. Update registration status CHECK to include new states
-- ============================================================
ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_status_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_status_check
    CHECK (status IN ('draft', 'invited', 'pending', 'confirmed', 'cancelled', 'refunded'));

-- ============================================================
-- 6. Public confirmation code generator function
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_confirmation_code(
  p_first_name TEXT,
  p_event_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_name_part TEXT;
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  -- Event year prefix: FF + 2-digit year
  SELECT 'FF' || TO_CHAR(start_date, 'YY') INTO v_prefix
  FROM public.events WHERE id = p_event_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'FF26';
  END IF;

  -- Sanitize name: uppercase, first 5 alpha chars only
  v_name_part := UPPER(REGEXP_REPLACE(LEFT(TRIM(p_first_name), 8), '[^A-Z]', '', 'gi'));
  IF LENGTH(v_name_part) < 2 THEN
    v_name_part := 'REG';
  END IF;
  v_name_part := LEFT(v_name_part, 5);

  -- Generate unique code with random 4-digit suffix
  LOOP
    v_code := v_prefix || '-' || v_name_part || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.registrations WHERE public_confirmation_code = v_code
    ) THEN
      RETURN v_code;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts > 100 THEN
      -- Fallback: 6-digit suffix for uniqueness
      v_code := v_prefix || '-' || v_name_part || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 7. Backfill existing records with confirmation codes
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, first_name, event_id
    FROM public.registrations
    WHERE public_confirmation_code IS NULL
  LOOP
    UPDATE public.registrations
    SET public_confirmation_code = public.generate_confirmation_code(r.first_name, r.event_id)
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Now enforce NOT NULL
ALTER TABLE public.registrations
  ALTER COLUMN public_confirmation_code SET NOT NULL;

-- ============================================================
-- 8. Indexes
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_confirmation_code
  ON public.registrations(public_confirmation_code);

CREATE INDEX IF NOT EXISTS idx_registrations_church_id
  ON public.registrations(church_id);

CREATE INDEX IF NOT EXISTS idx_registrations_attendance_type
  ON public.registrations(attendance_type);

-- Update unique active registration index to include new statuses
DROP INDEX IF EXISTS idx_unique_active_registration;
CREATE UNIQUE INDEX idx_unique_active_registration
  ON public.registrations (event_id, LOWER(email), LOWER(first_name), LOWER(last_name))
  WHERE status IN ('draft', 'invited', 'pending', 'confirmed');
