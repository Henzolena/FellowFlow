-- ============================================================
-- FellowFlow: Core schema
-- Tables: profiles, events, pricing_config, registrations, payments
-- Functions: handle_new_user, handle_updated_at, is_admin, is_super_admin
-- ============================================================

create extension if not exists "uuid-ossp" with schema extensions;

-- ============================================================
-- Helper functions
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. profiles
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  role        text not null default 'user'
                check (role in ('user', 'admin', 'super_admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. events
-- ============================================================
create table public.events (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  name                 text not null,
  description          text,
  start_date           date not null,
  end_date             date not null,
  duration_days        integer generated always as ((end_date - start_date) + 1) stored,
  adult_age_threshold  integer not null default 18,
  youth_age_threshold  integer not null default 13,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint events_dates_valid check (end_date >= start_date)
);

-- ============================================================
-- 3. pricing_config
-- ============================================================
create table public.pricing_config (
  id                uuid primary key default extensions.uuid_generate_v4(),
  event_id          uuid not null references public.events(id) on delete cascade unique,
  adult_full_price  numeric not null default 0,
  adult_daily_price numeric not null default 0,
  youth_full_price  numeric not null default 0,
  youth_daily_price numeric not null default 0,
  child_full_price  numeric not null default 0,
  child_daily_price numeric not null default 0,
  motel_stay_free   boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 4. registrations
-- ============================================================
create table public.registrations (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  event_id            uuid not null references public.events(id) on delete restrict,
  user_id             uuid references auth.users(id) on delete set null,
  first_name          text not null,
  last_name           text not null,
  email               text not null,
  phone               text,
  date_of_birth       date not null,
  age_at_event        integer not null,
  category            text not null check (category in ('adult', 'youth', 'child')),
  is_full_duration    boolean not null,
  is_staying_in_motel boolean,
  num_days            integer,
  computed_amount     numeric not null default 0,
  explanation_code    text not null,
  explanation_detail  text,
  status              text not null default 'pending'
                        check (status in ('pending', 'confirmed', 'cancelled', 'refunded')),
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_registrations_event_id on public.registrations(event_id);
create index idx_registrations_user_id  on public.registrations(user_id);
create index idx_registrations_email    on public.registrations(email);
create index idx_registrations_status   on public.registrations(status);

-- ============================================================
-- 5. payments
-- ============================================================
create table public.payments (
  id                         uuid primary key default extensions.uuid_generate_v4(),
  registration_id            uuid not null references public.registrations(id) on delete cascade,
  stripe_session_id          text unique,
  stripe_payment_intent_id   text unique,
  stripe_event_id            text unique,
  amount                     numeric not null,
  currency                   text not null default 'usd',
  status                     text not null default 'pending'
                               check (status in ('pending', 'completed', 'failed', 'refunded', 'expired')),
  idempotency_key            text unique,
  webhook_received_at        timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index idx_payments_registration_id on public.payments(registration_id);
create index idx_payments_session_id      on public.payments(stripe_session_id);
create index idx_payments_status          on public.payments(status);

-- ============================================================
-- updated_at triggers
-- ============================================================
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();

create trigger trg_pricing_config_updated_at
  before update on public.pricing_config
  for each row execute function public.handle_updated_at();

create trigger trg_registrations_updated_at
  before update on public.registrations
  for each row execute function public.handle_updated_at();

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.pricing_config enable row level security;
alter table public.registrations  enable row level security;
alter table public.payments       enable row level security;
