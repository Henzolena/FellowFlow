-- Add late registration surcharge tiers as JSONB
-- Format: [{ "start_date": "2026-06-01", "end_date": "2026-06-30", "amount": 20, "label": "Late registration (June)" }]
ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS late_surcharge_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pricing_config.late_surcharge_tiers IS
  'Array of {start_date, end_date, amount, label} objects for date-based registration surcharges';
