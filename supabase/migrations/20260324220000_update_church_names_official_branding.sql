-- ============================================================
-- Update church names to match official website branding
-- Date: March 24, 2026
-- ============================================================

-- Update church names to match verified official website branding
UPDATE public.churches SET name = 'Ethiopian Christians Fellowship Church in Houston'
  WHERE name = 'Ethiopian Christians Fellowship Church Houston';

UPDATE public.churches SET name = 'Ethiopian Evangelical Church in Dallas'
  WHERE name IN ('Ethiopian Evangelical Believers Church in Dallas', 'Ethiopian Evangelical Church Dallas');

UPDATE public.churches SET name = 'Ethiopian Evangelical Church Irving'
  WHERE name IN ('Ethiopian Evangelical Baptist Church of Irving', 'Ethiopian Evangelical Baptist Church Irving');

UPDATE public.churches SET name = 'Ethiopian Christians Fellowship Church in Kansas'
  WHERE name = 'Ethiopian Christians Fellowship Church Kansas';

UPDATE public.churches SET name = 'Ethiopian Evangelical Christian Church in Austin'
  WHERE name IN ('Ethiopian Christians Fellowship Church in Austin', 'Ethiopian Christians Fellowship Church Austin');

UPDATE public.churches SET name = 'Rehoboth Ethiopian Evangelical Church, Tulsa'
  WHERE name IN ('Rehoboth Ethiopian Evangelical Church Tulsa, Oklahoma', 'Rehoboth Ethiopian Evangelical Church Tulsa');

UPDATE public.churches SET name = 'Ethiopian Evangelical Church Allen'
  WHERE name IN ('Ethiopian Evangelical Church Allen, Texas', 'Ethiopian Evangelical Church in Allen');

UPDATE public.churches SET name = 'Ethiopian Christian Fellowship Church Missouri (ECFCMO)'
  WHERE name IN ('Ethiopian Christians Fellowship Church Missouri', 'Ethiopian Christian Fellowship Church Missouri');

-- Insert any missing churches with correct official names
INSERT INTO public.churches (name, city) VALUES
  ('Ethiopian Christians Fellowship Church in Houston', 'Houston, TX'),
  ('Ethiopian Evangelical Church in Dallas', 'Dallas, TX'),
  ('Ethiopian Evangelical Church Irving', 'Irving, TX'),
  ('The Redeemer of the World Evangelical Church', NULL),
  ('Ethiopian Christians Fellowship Church in Kansas', 'Kansas'),
  ('Ethiopian Evangelical Christian Church in Austin', 'Austin, TX'),
  ('Rehoboth Ethiopian Evangelical Church, Tulsa', 'Tulsa, OK'),
  ('El-Shaddai International Ethiopian Church', NULL),
  ('Ethiopian Evangelical Church Allen', 'Allen, TX'),
  ('Ethiopian Christian Fellowship Church Missouri (ECFCMO)', 'Kansas City, MO')
ON CONFLICT (name) DO NOTHING;

-- Update city information where we have verified addresses
UPDATE public.churches SET city = 'Houston, TX'
  WHERE name = 'Ethiopian Christians Fellowship Church in Houston' AND city IS NULL;

UPDATE public.churches SET city = 'Dallas, TX'
  WHERE name = 'Ethiopian Evangelical Church in Dallas' AND city IS NULL;

UPDATE public.churches SET city = 'Irving, TX'
  WHERE name = 'Ethiopian Evangelical Church Irving' AND city IS NULL;

UPDATE public.churches SET city = 'Austin, TX'
  WHERE name = 'Ethiopian Evangelical Christian Church in Austin' AND city IS NULL;

UPDATE public.churches SET city = 'Tulsa, OK'
  WHERE name = 'Rehoboth Ethiopian Evangelical Church, Tulsa' AND city IS NULL;

UPDATE public.churches SET city = 'Allen, TX'
  WHERE name = 'Ethiopian Evangelical Church Allen' AND city IS NULL;

UPDATE public.churches SET city = 'Kansas City, MO'
  WHERE name = 'Ethiopian Christian Fellowship Church Missouri (ECFCMO)' AND city IS NULL;
