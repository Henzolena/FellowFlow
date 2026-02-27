# Supabase Migrations

This directory contains the SQL migrations that reproduce the FellowFlow database schema from scratch.

## Migration files

| File | Description |
|------|-------------|
| `20260227025141_create_core_schema.sql` | Tables, functions, triggers, indexes, unique constraints, RLS enable |
| `20260227025203_create_rls_policies.sql` | All Row Level Security policies |

## Applying migrations

### Option A: Supabase CLI (recommended)

```bash
supabase db push
```

### Option B: Manual via Supabase SQL Editor

Run each file in order in the Supabase Dashboard → SQL Editor.

### Option C: Fresh project

```bash
supabase init
supabase link --project-ref <your-project-ref>
supabase db push
```

## Key design decisions

- **`is_admin()` / `is_super_admin()`** — `SECURITY DEFINER` SQL functions used in RLS policies to avoid inline subqueries.
- **`handle_new_user()`** — trigger on `auth.users` that auto-creates a `profiles` row on signup.
- **`stripe_event_id` UNIQUE** — enforces webhook idempotency at the DB level.
- **`stripe_session_id` UNIQUE** — prevents duplicate payment records per checkout session.
- **No public SELECT on `registrations`/`payments`** — server routes use `service_role` key (bypasses RLS). The UUID itself acts as an unguessable access token.
- **`handle_updated_at()`** — trigger on all tables to auto-set `updated_at` on UPDATE.
