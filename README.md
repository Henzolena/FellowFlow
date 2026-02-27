# FellowFlow

Conference registration system with dynamic pricing, online payments, and admin management.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** Next.js API Routes, Zod validation
- **Database:** Supabase (PostgreSQL with RLS)
- **Auth:** Supabase Auth (email/password)
- **Payments:** Stripe Checkout with webhook confirmation

## Pricing Logic

| Category | Full Conference | Per Day |
|----------|----------------|---------|
| Adult (18+) | P1 | P1.1 × days |
| Youth (13–17) | P2 | P2.1 × days |
| Child (<13) | P3 | P3.1 × days |

- Full conference + motel stay → **Free** registration
- All pricing is computed server-side

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in your Supabase and Stripe keys
npm run dev
```

## Admin Access

- URL: `/admin`
- Default credentials: `admin@fellowflow.com` / `FellowFlow2026!`
- Change the password after first login

## Stripe Webhook (Local Development)

```bash
# Install Stripe CLI, then:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── register/                   # Registration wizard
│   ├── admin/                      # Admin portal (protected)
│   ├── auth/                       # Login & auth callback
│   └── api/                        # Server API routes
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── registration/               # Wizard & price summary
│   ├── admin/                      # Admin sidebar
│   └── layout/                     # Header & footer
├── lib/
│   ├── supabase/                   # Client, server, admin clients
│   ├── stripe/                     # Stripe server & browser clients
│   ├── pricing/                    # Pricing computation engine
│   └── validations/                # Zod schemas
├── types/                          # TypeScript type definitions
└── middleware.ts                   # Auth & admin route protection
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (webhooks) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Prod | Stripe webhook signing secret |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for redirects |

## Deployment

Deploy to Vercel or any Node.js hosting platform. Ensure all environment variables are set in production, including `STRIPE_WEBHOOK_SECRET` for payment confirmation.
