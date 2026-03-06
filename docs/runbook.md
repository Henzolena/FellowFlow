# FellowFlow Incident Runbook

## 1. Payments Not Confirming (Webhook Failures)

**Symptoms:** Registrations stuck in "pending" after successful Stripe payment.

**Diagnosis:**
1. Check `webhook_failures` table in Supabase for recent entries
2. Check Stripe Dashboard → Webhooks → Recent events for delivery failures
3. Check Netlify function logs for webhook errors

**Resolution:**
- **Webhook endpoint unreachable:** Verify Netlify deploy is live. Check Stripe webhook URL matches `https://fellowflow.online/api/webhooks/stripe`
- **Signature mismatch:** Rotate `STRIPE_WEBHOOK_SECRET` — update in both Stripe Dashboard and Netlify env vars, redeploy
- **Amount mismatch:** Check `webhook_failures.failure_reason` for details. Manual DB fix:
  ```sql
  -- After verifying payment in Stripe Dashboard
  UPDATE payments SET status = 'completed', webhook_received_at = now()
  WHERE stripe_session_id = '<session_id>' AND status = 'pending';
  
  UPDATE registrations SET status = 'confirmed', confirmed_at = now()
  WHERE id = '<registration_id>' AND status = 'pending';
  ```

## 2. Orphaned Registrations (Stuck Pending)

**Symptoms:** Registrations in "pending" with no corresponding active Stripe session.

**Diagnosis:**
```sql
SELECT r.id, r.email, r.first_name, r.last_name, r.created_at, p.status as payment_status, p.updated_at
FROM registrations r
LEFT JOIN payments p ON p.registration_id = r.id
WHERE r.status = 'pending'
AND r.created_at < now() - interval '2 hours';
```

**Resolution:**
- The `cleanup-orphaned-registrations` edge function runs every 30 minutes via pg_cron (job ID: 2)
- To trigger manually:
  ```bash
  curl -X POST https://cjvbvdzfijqhnrrbzuhl.supabase.co/functions/v1/cleanup-orphaned-registrations \
    -H "Authorization: Bearer <service_role_key>"
  ```
- Check pg_cron job status:
  ```sql
  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
  ```

## 3. Email Delivery Failures

**Symptoms:** Users not receiving confirmation or receipt emails.

**Diagnosis:**
```sql
SELECT * FROM email_logs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20;
```

**Resolution:**
- Check Resend dashboard for delivery status and bounces
- Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are correct
- To manually resend for a registration:
  ```bash
  curl -X POST https://fellowflow.online/api/registration/resend-confirmation \
    -H "Content-Type: application/json" \
    -d '{"registrationId": "<uuid>", "email": "<email>"}'
  ```

## 4. Rate Limiting Issues

**Symptoms:** Users getting 429 errors too frequently.

**Note:** Rate limiting is in-memory per serverless instance. On Netlify, each function invocation has its own memory, so rate limits reset on cold starts. Current limits:
- `create-session`: 10 req/min/IP
- `create-group`: 10 req/min/IP
- `quote` / `quote-group`: 30 req/min/IP
- `check-duplicate`: 20 req/min/IP
- `resend-confirmation` / `send-receipt`: 5 req/min/IP
- `verify`: 15 req/min/IP

## 5. Supabase Connection Issues

**Symptoms:** 500 errors across all API routes.

**Diagnosis:**
1. Check Supabase project status at `https://supabase.com/dashboard/project/cjvbvdzfijqhnrrbzuhl`
2. Check if project is paused (free tier pauses after inactivity)
3. Verify `NEXT_PUBLIC_SUPABASE_URL` and keys are correct

**Resolution:**
- If paused, restore from Supabase dashboard
- If connection pool exhausted, check for connection leaks in recent deploys

## 6. Stripe API Errors

**Symptoms:** Payment session creation fails.

**Diagnosis:**
- Check Netlify function logs for Stripe errors
- Verify `STRIPE_SECRET_KEY` is valid in Stripe Dashboard → API Keys

**Resolution:**
- If key rotated, update `STRIPE_SECRET_KEY` in Netlify env vars and redeploy
- If Stripe is down, check `status.stripe.com`

## 7. Duplicate Registration Constraint Violations

**Symptoms:** Users see "Duplicate registration detected" errors.

**Context:** The `idx_unique_active_registration` partial unique index prevents the same person (by email + name) from registering twice for the same event.

**Resolution:**
- This is expected behavior — the user already has a pending or confirmed registration
- If they need to re-register (e.g., after cancellation), manually update the old registration:
  ```sql
  UPDATE registrations SET status = 'cancelled' WHERE id = '<old_registration_id>';
  ```
