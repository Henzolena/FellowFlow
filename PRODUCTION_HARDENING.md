# Production Hardening Checklist

Use this checklist before every production deployment.

---

## 1. Environment Variables

| Variable | Required | Where | Notes |
|----------|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Netlify env | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Netlify env | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Netlify env | **SECRET** — never expose client-side |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | Netlify env | Stripe publishable key |
| `STRIPE_SECRET_KEY` | ✅ | Netlify env | **SECRET** — server-only |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Netlify env | `whsec_...` from Stripe dashboard |
| `NEXT_PUBLIC_APP_URL` | ✅ | Netlify env | Your production URL (e.g. `https://fellowflow.netlify.app`) |
| `ALLOW_INSECURE_WEBHOOKS` | ❌ NEVER | — | **Must NOT be set in production.** Only for local dev. |

### Critical checks

- [ ] `STRIPE_WEBHOOK_SECRET` is set and matches the Stripe dashboard webhook signing secret.
- [ ] `ALLOW_INSECURE_WEBHOOKS` is **not set** in production (or set to any value other than `true`).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set and never exposed in any `NEXT_PUBLIC_*` variable.
- [ ] `NEXT_PUBLIC_APP_URL` points to the real production domain (not `localhost`).

---

## 2. Stripe Webhook Configuration

- [ ] In the [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks):
  - Endpoint URL is `https://<your-domain>/api/webhooks/stripe`
  - Events subscribed: `checkout.session.completed`, `checkout.session.expired`
  - Signing secret matches `STRIPE_WEBHOOK_SECRET` env var
- [ ] Test the webhook with Stripe CLI or dashboard "Send test webhook" button.
- [ ] Verify the webhook handler returns `200` for valid events and `400` for invalid signatures.

---

## 3. Supabase Security

- [ ] RLS is enabled on all 5 public tables (`profiles`, `events`, `pricing_config`, `registrations`, `payments`).
- [ ] No open `SELECT` policies on `registrations` or `payments` (verified via `pg_policies`).
- [ ] `is_admin()` and `is_super_admin()` functions exist and are `SECURITY DEFINER`.
- [ ] `stripe_event_id` column on `payments` has a `UNIQUE` constraint.
- [ ] `stripe_session_id` column on `payments` has a `UNIQUE` constraint.
- [ ] Run security advisors periodically:
  ```
  -- Via Supabase Dashboard → Database → Advisors → Security
  -- Or via MCP: get_advisors(project_id, type: "security")
  ```

---

## 4. Admin Client Safety

The `createAdminClient()` helper in `src/lib/supabase/admin.ts`:

- [x] Uses `SUPABASE_SERVICE_ROLE_KEY` (not the anon key).
- [x] Throws if the key is missing (fails fast, never falls back to anon).
- [x] Only imported in server-side code (API routes, server components).
- [ ] **Verify**: grep for `createAdminClient` — it should NEVER appear in any `"use client"` file.

```bash
grep -r "createAdminClient" src/ --include="*.ts" --include="*.tsx" -l
# All results should be server-side files only
```

---

## 5. Webhook Security

- [x] In production: if `STRIPE_WEBHOOK_SECRET` is missing, webhook returns `500` immediately.
- [x] Dev fallback only activates when BOTH `NODE_ENV=development` AND `ALLOW_INSECURE_WEBHOOKS=true`.
- [x] Idempotency enforced via `stripe_event_id` UNIQUE constraint + early return on duplicate.
- [x] First-write-wins: payment and registration updates check `status = 'pending'` before write.
- [ ] **Verify**: replay an event via Stripe CLI — second delivery should log "already processed".

---

## 6. API Route Auth

All `/api/admin/*` routes use `requireAdmin()` from `src/lib/auth/admin-guard.ts`:

- [x] `GET /api/admin/registrations` — guarded
- [x] `GET /api/admin/registrations/[id]` — guarded
- [x] `GET/POST/PUT /api/admin/events` — guarded
- [x] `GET /api/admin/export` — guarded
- [x] `GET/POST /api/admin/users` — inline auth checks (pre-existing)
- [x] `PATCH/DELETE /api/admin/users/[id]` — inline auth checks (pre-existing)
- [ ] **Verify**: `curl` any admin endpoint without auth → expect `401`.

---

## 7. Rate Limiting

Current: in-memory sliding-window limiter (per-instance).

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/pricing/quote` | 30 req | 60s per IP |
| `/api/registration/create` | 10 req | 60s per IP |

### ⚠️ Multi-instance limitation

The in-memory limiter resets on deploy and is not shared across instances. For production scale-out, swap to a shared store. See `src/lib/rate-limit.ts` for the upgrade path and `RATE_LIMIT_UPGRADE.md` for implementation details.

---

## 8. Pre-deploy Smoke Test

```bash
# 1. Build succeeds
npm run build

# 2. No createAdminClient in client files
grep -rn "createAdminClient" src/ --include="*.tsx" | grep "use client" && echo "FAIL" || echo "PASS"

# 3. No ALLOW_INSECURE_WEBHOOKS in production env
# (check your Netlify/hosting dashboard manually)

# 4. TypeScript compiles clean
npx tsc --noEmit
```
