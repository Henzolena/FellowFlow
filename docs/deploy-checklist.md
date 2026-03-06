# FellowFlow Deploy Checklist

## Pre-Deploy

- [ ] All CI checks pass (`npm run lint && npm run typecheck && npm test && npm run build`)
- [ ] No unresolved merge conflicts
- [ ] `.env.production` values confirmed (see [Environment Matrix](#environment-matrix))
- [ ] Database migrations applied to production Supabase (`cjvbvdzfijqhnrrbzuhl`)
- [ ] Stripe webhook endpoint configured for production domain
- [ ] Stripe webhook signing secret matches `STRIPE_WEBHOOK_SECRET` env var

## Deploy

1. Push to `main` (triggers CI via GitHub Actions)
2. Netlify auto-deploys from `main` (build command: `npx next build --webpack`)
3. Verify deploy in Netlify dashboard — check build logs for errors
4. If Netlify serves stale content, purge Durable cache:
   ```bash
   curl -X POST https://api.netlify.com/api/v1/purge \
     -H "Authorization: Bearer $NETLIFY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"site_id": "ad163f80-c7b4-4d87-91b9-8d8067999c8a"}'
   ```

## Post-Deploy

- [ ] Visit `https://fellowflow.online` — confirm pages load (no MIME type errors)
- [ ] Test a registration flow end-to-end (free + paid)
- [ ] Verify Stripe webhook receives events (`Stripe Dashboard → Webhooks → Recent events`)
- [ ] Check Supabase logs for any errors from pg_cron job (`cleanup-orphaned-registrations`)
- [ ] Confirm email sending works (check `email_logs` table)

## Rollback

1. In Netlify dashboard → Deploys → select previous working deploy → "Publish deploy"
2. Purge Durable cache (see above)
3. If DB migration was applied, assess whether rollback migration is needed

---

## Environment Matrix

| Variable | Dev (`.env.local`) | Production |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cjvbvdzfijqhnrrbzuhl.supabase.co` | Same |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project anon key | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Project service role key | Same (⚠️ never expose) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (CLI) | `whsec_...` (Dashboard) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://fellowflow.online` |
| `RESEND_API_KEY` | `re_...` | `re_...` |
| `RESEND_FROM_EMAIL` | Dev sender | Production sender |
| `ALLOW_INSECURE_WEBHOOKS` | `true` (dev only) | **Must not be set** |
| `LOG_LEVEL` | `debug` | `info` |
