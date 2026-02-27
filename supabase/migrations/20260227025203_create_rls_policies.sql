-- ============================================================
-- FellowFlow: Row Level Security policies
-- Matches live Supabase state exactly.
-- Service-role key bypasses RLS (used by webhook + admin client).
-- ============================================================

-- ============================================================
-- profiles
-- ============================================================

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Allow profile creation"
  on public.profiles for insert
  with check (true);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (is_admin());

create policy "Admins can update all profiles"
  on public.profiles for update
  using (is_admin());

create policy "Super admins can update profiles"
  on public.profiles for update
  using (is_super_admin());

-- ============================================================
-- events
-- ============================================================

create policy "Anyone can view active events"
  on public.events for select
  using (is_active = true);

create policy "Admins can view all events"
  on public.events for select
  using (is_admin());

create policy "Admins can insert events"
  on public.events for insert
  with check (is_admin());

create policy "Admins can update events"
  on public.events for update
  using (is_admin());

create policy "Admins can delete events"
  on public.events for delete
  using (is_admin());

-- ============================================================
-- pricing_config
-- ============================================================

create policy "Anyone can view pricing for active events"
  on public.pricing_config for select
  using (
    exists (
      select 1 from public.events
      where events.id = pricing_config.event_id
        and events.is_active = true
    )
  );

create policy "Admins can view all pricing"
  on public.pricing_config for select
  using (is_admin());

create policy "Admins can insert pricing"
  on public.pricing_config for insert
  with check (is_admin());

create policy "Admins can update pricing"
  on public.pricing_config for update
  using (is_admin());

create policy "Admins can delete pricing"
  on public.pricing_config for delete
  using (is_admin());

-- ============================================================
-- registrations
-- No public SELECT — UUID acts as access token via service_role.
-- ============================================================

create policy "Users can view own registrations"
  on public.registrations for select
  using (auth.uid() = user_id);

create policy "Anon and auth users can create registrations"
  on public.registrations for insert
  with check (true);

create policy "Admins can view all registrations"
  on public.registrations for select
  using (is_admin());

create policy "Admins can update registrations"
  on public.registrations for update
  using (is_admin());

-- NOTE: No public UPDATE/DELETE on registrations.
-- Webhook uses service_role which bypasses RLS.

-- ============================================================
-- payments
-- No public SELECT/UPDATE — webhook uses service_role.
-- ============================================================

create policy "Users can view own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.registrations r
      where r.id = payments.registration_id
        and r.user_id = auth.uid()
    )
  );

create policy "Authenticated users can insert payments"
  on public.payments for insert
  with check (
    exists (
      select 1 from public.registrations r
      where r.id = payments.registration_id
        and (r.user_id = auth.uid() or r.user_id is null)
    )
  );

create policy "Admins can view all payments"
  on public.payments for select
  using (is_admin());

create policy "Admins can update payments"
  on public.payments for update
  using (is_admin());

-- NOTE: No public UPDATE on payments.
-- Webhook writes via service_role (bypasses RLS).
