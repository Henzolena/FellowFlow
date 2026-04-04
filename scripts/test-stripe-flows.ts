#!/usr/bin/env npx tsx
/**
 * End-to-end Stripe integration flow tests.
 *
 * Tests every product type: Adult Full, Youth Full, Child Full,
 * Group (mixed), KOTE, Partial, and standalone Meal Purchase.
 *
 * Prerequisites:
 *   1. Dev server running:  npm run dev
 *   2. .env.local configured with Stripe test keys
 *
 * Usage:
 *   npx tsx scripts/test-stripe-flows.ts
 *   npx tsx scripts/test-stripe-flows.ts --skip-cleanup   # keep test data
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/* ================================================================== */
/*  Config & constants                                                 */
/* ================================================================== */

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const EVENT_ID = "20bad896-a715-4519-a533-62dd64f7233c";

// Meal service IDs during the event (Jul 30 – Aug 2)
const MEAL_IDS = {
  thuDinner: "495d1247-37ea-4141-92a3-c78fc1fc689d",
  friBreakfast: "83aa9acd-e4ca-432f-bbe8-b5b898c6ccc8",
  friLunch: "b28a3657-bb83-4438-a9bf-191a18616c11",
  friDinner: "e3255973-5e5c-4315-afb8-8fa3d6f053cb",
  satBreakfast: "195eac1e-9bcf-4b9f-a266-ce343d9230d3",
  satLunch: "eff42d9d-1b6c-4df7-a980-aa9a054f3fe0",
  satDinner: "7baf227d-57f7-4ac3-b921-69dc6d4fcd3a",
  sunBreakfast: "f63aac78-45ae-4455-ba66-5d4ea933a564",
  sunLunch: "8679d9a6-f454-4e2d-b316-489bdbdc7e76",
};

const TEST_EMAILS = [
  "henokrobale@gmail.com",
  "harmonika.hn@gmail.com",
  "henzolina.s.j@gmail.com",
  "henzolina2@gmail.com",
];

const SKIP_CLEANUP = process.argv.includes("--skip-cleanup");

/* ================================================================== */
/*  Clients                                                            */
/* ================================================================== */

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion });

/* ================================================================== */
/*  Terminal colours                                                    */
/* ================================================================== */

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const PASS = `${c.green}✔ PASS${c.reset}`;
const FAIL = `${c.red}✘ FAIL${c.reset}`;
const SKIP = `${c.yellow}⊘ SKIP${c.reset}`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`    ${PASS}  ${label}`);
  } else {
    failedTests++;
    failures.push(`${label}: ${detail}`);
    console.log(`    ${FAIL}  ${label}${detail ? ` — ${c.red}${detail}${c.reset}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${c.bold}${c.cyan}━━━ ${title} ━━━${c.reset}`);
}

function step(msg: string) {
  console.log(`  ${c.dim}→${c.reset} ${msg}`);
}

/* ================================================================== */
/*  API helpers                                                        */
/* ================================================================== */

async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

/**
 * Send a signed webhook event to the dev server.
 */
async function sendWebhook(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
    timestamp: ts,
  });
  const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

/* ================================================================== */
/*  DB helpers                                                         */
/* ================================================================== */

async function getRegistration(id: string) {
  const { data } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function getPayment(stripeSessionId: string) {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  return data;
}

async function getEntitlements(registrationId: string) {
  const { data } = await supabase
    .from("service_entitlements")
    .select("*")
    .eq("registration_id", registrationId);
  return data ?? [];
}

async function getMealPurchase(registrationId: string) {
  const { data } = await supabase
    .from("meal_purchases")
    .select("*")
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/* ================================================================== */
/*  Stripe session inspector                                           */
/* ================================================================== */

async function inspectStripeSession(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "line_items.data.price.product"],
  });
  return session;
}

/* ================================================================== */
/*  Cleanup                                                            */
/* ================================================================== */

async function cleanup() {
  step("Cleaning up previous test data…");

  // Get test registration IDs
  const { data: regs } = await supabase
    .from("registrations")
    .select("id")
    .eq("event_id", EVENT_ID)
    .in("email", TEST_EMAILS);

  if (!regs || regs.length === 0) {
    step("No previous test data found.");
    return;
  }

  const regIds = regs.map((r) => r.id);
  step(`Found ${regIds.length} test registration(s) to clean up.`);

  // Delete in dependency order
  await supabase.from("service_entitlements").delete().in("registration_id", regIds);
  await supabase.from("email_logs").delete().in("registration_id", regIds);

  // Meal purchases
  const { data: mealPurchases } = await supabase
    .from("meal_purchases")
    .select("id")
    .in("registration_id", regIds);
  if (mealPurchases && mealPurchases.length > 0) {
    const mpIds = mealPurchases.map((m) => m.id);
    await supabase.from("meal_purchase_items").delete().in("meal_purchase_id", mpIds);
    await supabase.from("meal_purchases").delete().in("id", mpIds);
  }

  await supabase.from("webhook_failures").delete().in("registration_id", regIds);
  await supabase.from("payments").delete().in("registration_id", regIds);

  // Group-level cleanups
  const { data: groupRegs } = await supabase
    .from("registrations")
    .select("group_id")
    .eq("event_id", EVENT_ID)
    .in("email", TEST_EMAILS)
    .not("group_id", "is", null);
  if (groupRegs) {
    const groupIds = [...new Set(groupRegs.map((r) => r.group_id).filter(Boolean))];
    if (groupIds.length > 0) {
      await supabase.from("email_logs").delete().in("group_id", groupIds);
      await supabase.from("payments").delete().in("group_id", groupIds);
    }
  }

  await supabase.from("registrations").delete().in("id", regIds);
  step(`Cleaned up ${regIds.length} registrations and related data.`);
}

/* ================================================================== */
/*  Webhook event builder                                              */
/* ================================================================== */

function buildCheckoutCompletedEvent(opts: {
  sessionId: string;
  amountTotal: number;
  metadata: Record<string, string>;
}) {
  return {
    id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        payment_intent: `pi_test_${Date.now()}`,
        amount_total: opts.amountTotal,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        metadata: opts.metadata,
      },
    },
  };
}

function buildMealCheckoutEvent(opts: {
  sessionId: string;
  amountTotal: number;
  metadata: Record<string, string>;
}) {
  return buildCheckoutCompletedEvent({
    ...opts,
    metadata: { ...opts.metadata, type: "meal_purchase" },
  });
}

/* ================================================================== */
/*  FLOW 1: Solo Adult — Full Conference ($150)                        */
/* ================================================================== */

async function flow1_soloAdultFull() {
  section("Flow 1: Solo Adult Full Conference — henokrobale@gmail.com");

  // Step 1: Create registration via API
  step("Creating solo registration (adult, full conference)…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Henok",
    lastName: "TestAdult",
    email: "henokrobale@gmail.com",
    phone: "+1-555-111-0001",
    dateOfBirth: "1990-05-15",
    isFullDuration: true,
  });

  assert("Registration created (201 or 200)", status === 200 || status === 201, `status=${status} body=${JSON.stringify(json)}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Status is pending", reg.status === "pending");
  assert("Computed amount = $150", Number(reg.computed_amount) === 150, `got $${reg.computed_amount}`);
  assert("Category = adult", reg.category === "adult");
  assert("Explanation code = FULL_ADULT", reg.explanation_code === "FULL_ADULT");

  // Step 2: Create payment session
  step("Creating Stripe checkout session…");
  const payRes = await apiPost("/api/payment/create-session", {
    registrationId: reg.id,
  });
  assert("Payment session created", payRes.ok, `status=${payRes.status} body=${JSON.stringify(payRes.json)}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;
  step(`Stripe session: ${sessionId}`);

  // Step 3: Inspect Stripe session
  step("Verifying Stripe session details…");
  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 15000 cents", stripeSession.amount_total === 15000, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  assert("1 line item (no surcharge pre-July)", lineItems.length === 1, `got ${lineItems.length}`);

  if (lineItems[0]) {
    const product = lineItems[0].price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Product linked to adult-full", productId?.includes("adult-full") ?? false, `product=${productId}`);
    assert("Line item amount = 15000", lineItems[0].amount_total === 15000, `got ${lineItems[0].amount_total}`);
  }

  // Step 4: Verify payment record in DB
  step("Checking payment record in DB…");
  const payment = await getPayment(sessionId);
  assert("Payment record exists", !!payment);
  assert("Payment status = pending", payment?.status === "pending");
  assert("Payment amount = 150", Number(payment?.amount) === 150, `got ${payment?.amount}`);

  // Step 5: Simulate webhook
  step("Simulating checkout.session.completed webhook…");
  const webhookRes = await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 15000,
      metadata: {
        registration_id: reg.id,
        event_id: EVENT_ID,
      },
    })
  );
  assert("Webhook accepted", webhookRes.ok, `status=${webhookRes.status}`);

  // Step 6: Verify final DB state
  step("Verifying final state…");
  await new Promise((r) => setTimeout(r, 1500)); // Allow async processing

  const finalReg = await getRegistration(reg.id);
  assert("Registration status = confirmed", finalReg?.status === "confirmed", `got ${finalReg?.status}`);
  assert("confirmed_at is set", !!finalReg?.confirmed_at);

  const finalPayment = await getPayment(sessionId);
  assert("Payment status = completed", finalPayment?.status === "completed", `got ${finalPayment?.status}`);

  const entitlements = await getEntitlements(reg.id);
  assert("Service entitlements created", entitlements.length > 0, `got ${entitlements.length}`);

  return reg.id;
}

/* ================================================================== */
/*  FLOW 2: Solo Youth — Full Conference ($100)                        */
/* ================================================================== */

async function flow2_soloYouthFull() {
  section("Flow 2: Solo Youth Full Conference — harmonika.hn@gmail.com");

  step("Creating solo registration (youth, full conference)…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Harmony",
    lastName: "TestYouth",
    email: "harmonika.hn@gmail.com",
    phone: "+1-555-111-0002",
    dateOfBirth: "2013-03-10", // age 13 at Jul 30 2026 → youth
    isFullDuration: true,
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $100", Number(reg.computed_amount) === 100, `got $${reg.computed_amount}`);
  assert("Category = youth", reg.category === "youth");
  assert("Code = FULL_YOUTH", reg.explanation_code === "FULL_YOUTH");

  step("Creating payment session…");
  const payRes = await apiPost("/api/payment/create-session", { registrationId: reg.id });
  assert("Payment session created", payRes.ok, `status=${payRes.status}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;
  step(`Stripe session: ${sessionId}`);

  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 10000 cents", stripeSession.amount_total === 10000, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  if (lineItems[0]) {
    const product = lineItems[0].price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Product linked to youth-full", productId?.includes("youth-full") ?? false, `product=${productId}`);
  }

  step("Simulating webhook…");
  await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 10000,
      metadata: { registration_id: reg.id, event_id: EVENT_ID },
    })
  );

  await new Promise((r) => setTimeout(r, 1500));
  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed", `got ${finalReg?.status}`);

  const finalPayment = await getPayment(sessionId);
  assert("Payment completed", finalPayment?.status === "completed", `got ${finalPayment?.status}`);

  return reg.id;
}

/* ================================================================== */
/*  FLOW 3: Group — Adult + Child + Infant ($200)                      */
/* ================================================================== */

async function flow3_groupFamily() {
  section("Flow 3: Group (Adult $150 + Child $50 + Infant FREE) — henzolina.s.j@gmail.com");

  step("Creating group registration…");
  const { status, json } = await apiPost("/api/registration/create-group", {
    eventId: EVENT_ID,
    email: "henzolina.s.j@gmail.com",
    phone: "+1-555-111-0003",
    registrants: [
      {
        firstName: "Parent",
        lastName: "TestGroup",
        dateOfBirth: "1985-08-20", // age 40 → adult, $150
        gender: "male",
        isFullDuration: true,
      },
      {
        firstName: "Kid",
        lastName: "TestGroup",
        dateOfBirth: "2019-01-15", // age 7 → child, $50
        gender: "female",
        isFullDuration: true,
      },
      {
        firstName: "Baby",
        lastName: "TestGroup",
        dateOfBirth: "2025-06-01", // age 1 → infant, FREE
        gender: "male",
        isFullDuration: true,
      },
    ],
  });

  assert("Group created", status === 200, `status=${status} body=${JSON.stringify(json)?.slice(0, 200)}`);
  if (!json?.groupId) return null;

  const groupId = json.groupId as string;
  const regs = json.registrations as { id: string; computed_amount: number; category: string; status: string; secure_token: string }[];
  assert("3 registrations returned", regs?.length === 3, `got ${regs?.length}`);
  assert("Subtotal = $200", json.subtotal === 200, `got ${json.subtotal}`);
  assert("Grand total = $200 (no surcharge)", json.grandTotal === 200, `got ${json.grandTotal}`);
  assert("Infant is free", Number(regs[2]?.computed_amount) === 0);

  step("Creating group payment session…");
  const payRes = await apiPost("/api/payment/create-session", { groupId });
  assert("Payment session created", payRes.ok, `status=${payRes.status} body=${JSON.stringify(payRes.json)?.slice(0, 200)}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;
  step(`Stripe session: ${sessionId}`);

  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 20000 cents", stripeSession.amount_total === 20000, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  assert("2 line items (infant excluded)", lineItems.length === 2, `got ${lineItems.length}`);

  // Check product IDs
  for (const li of lineItems) {
    const product = li.price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    if (li.amount_total === 15000) {
      assert("Adult line item → adult-full product", productId?.includes("adult-full") ?? false, `product=${productId}`);
    } else if (li.amount_total === 5000) {
      assert("Child line item → child-full product", productId?.includes("child-full") ?? false, `product=${productId}`);
    }
  }

  step("Simulating webhook…");
  await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 20000,
      metadata: { registration_id: regs[0].id, group_id: groupId, event_id: EVENT_ID },
    })
  );

  await new Promise((r) => setTimeout(r, 2000));
  for (const reg of regs) {
    const r = await getRegistration(reg.id);
    assert(`${reg.category ?? "member"} registration confirmed`, r?.status === "confirmed", `got ${r?.status}`);
  }

  const payment = await getPayment(sessionId);
  assert("Payment completed", payment?.status === "completed", `got ${payment?.status}`);

  return { groupId, regs };
}

/* ================================================================== */
/*  FLOW 4: KOTE 2 days + Meal Purchase                                */
/* ================================================================== */

async function flow4_kotePlusMeals() {
  section("Flow 4: KOTE 2 days ($20) + Meal Purchase ($24) — henzolina2@gmail.com");

  // KOTE with selectedDays (day 1 and 2 of event)
  step("Creating KOTE registration…");
  const { status, json } = await apiPost("/api/registration/create-group", {
    eventId: EVENT_ID,
    email: "henzolina2@gmail.com",
    phone: "+1-555-111-0004",
    registrants: [
      {
        firstName: "Kote",
        lastName: "TestWalker",
        dateOfBirth: "1995-12-01", // age 30 → adult
        gender: "male",
        isFullDuration: false,
        numDays: 2,
        selectedDays: [1, 2],
        attendanceType: "kote",
      },
    ],
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registrations?.[0]) return null;

  const reg = json.registrations[0] as { id: string; computed_amount: number; secure_token: string; attendance_type: string };
  assert("Amount = $20 (KOTE $10 × 2 days)", Number(reg.computed_amount) === 20, `got $${reg.computed_amount}`);
  assert("Attendance type = kote", reg.attendance_type === "kote");

  const groupId = json.groupId as string;

  step("Creating KOTE payment session…");
  const payRes = await apiPost("/api/payment/create-session", { groupId });
  assert("Payment session created", payRes.ok, `status=${payRes.status}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;

  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 2000 cents", stripeSession.amount_total === 2000, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  if (lineItems[0]) {
    const product = lineItems[0].price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Product → kote-daily", productId?.includes("kote-daily") ?? false, `product=${productId}`);
  }

  step("Simulating KOTE payment webhook…");
  await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 2000,
      metadata: { registration_id: reg.id, group_id: groupId, event_id: EVENT_ID },
    })
  );

  await new Promise((r) => setTimeout(r, 1500));
  const confirmedReg = await getRegistration(reg.id);
  assert("KOTE registration confirmed", confirmedReg?.status === "confirmed", `got ${confirmedReg?.status}`);

  // ── Now purchase meals separately ──
  step("Purchasing 2 meals (Fri Breakfast + Fri Lunch) via /api/meals/purchase…");
  const mealServiceIds = [MEAL_IDS.friBreakfast, MEAL_IDS.friLunch];
  const mealRes = await apiPost("/api/meals/purchase", {
    secureToken: confirmedReg?.secure_token,
    serviceIds: mealServiceIds,
  });
  assert("Meal purchase initiated", mealRes.ok, `status=${mealRes.status} body=${JSON.stringify(mealRes.json)?.slice(0, 300)}`);
  if (!mealRes.json?.sessionId) return { regId: reg.id, sessionId };

  const mealSessionId = mealRes.json.sessionId as string;
  step(`Meal Stripe session: ${mealSessionId}`);

  const mealStripeSession = await inspectStripeSession(mealSessionId);
  // Adult meals = $12 each, 2 meals = $24
  assert("Meal Stripe amount = 2400 cents", mealStripeSession.amount_total === 2400, `got ${mealStripeSession.amount_total}`);

  const mealLineItems = mealStripeSession.line_items?.data ?? [];
  assert("2 meal line items", mealLineItems.length === 2, `got ${mealLineItems.length}`);

  // Check meal products are linked
  for (const li of mealLineItems) {
    const product = li.price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Meal product linked (ff-sc-...)", productId?.startsWith("ff-sc-") ?? false, `product=${productId}`);
  }

  // Get meal purchase record for webhook metadata
  const mealPurchase = await getMealPurchase(reg.id);
  assert("Meal purchase record created in DB", !!mealPurchase);

  step("Simulating meal purchase webhook…");
  if (mealPurchase) {
    await sendWebhook(
      buildMealCheckoutEvent({
        sessionId: mealSessionId,
        amountTotal: 2400,
        metadata: {
          registration_id: reg.id,
          meal_purchase_id: mealPurchase.id,
        },
      })
    );

    await new Promise((r) => setTimeout(r, 1500));
    const updatedPurchase = await getMealPurchase(reg.id);
    assert("Meal purchase status = completed", updatedPurchase?.payment_status === "completed", `got ${updatedPurchase?.payment_status}`);

    const entitlements = await getEntitlements(reg.id);
    const mealEntitlements = entitlements.filter((e) => mealServiceIds.includes(e.service_id));
    assert("Meal entitlements created (2)", mealEntitlements.length === 2, `got ${mealEntitlements.length}`);
  }

  return { regId: reg.id, sessionId };
}

/* ================================================================== */
/*  FLOW 5: Partial 2 days — Adult ($76)                               */
/* ================================================================== */

async function flow5_partialAdult() {
  section("Flow 5: Partial 2 days Adult ($76) — henokrobale@gmail.com");

  step("Creating partial registration (2 nights × $38)…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Partial",
    lastName: "TestDorm",
    email: "henokrobale@gmail.com",
    phone: "+1-555-111-0005",
    dateOfBirth: "2000-06-15", // age 26 → adult
    isFullDuration: false,
    isStayingInMotel: false,
    numDays: 2,
    selectedDays: [1, 2], // Thu + Fri (no Sunday)
    attendanceType: "partial",
  });

  assert("Registration created", status === 200, `status=${status} body=${JSON.stringify(json)?.slice(0, 200)}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $76 (2 × $38)", Number(reg.computed_amount) === 76, `got $${reg.computed_amount}`);
  assert("Code = PARTIAL_ADULT", reg.explanation_code === "PARTIAL_ADULT");

  step("Creating payment session…");
  const payRes = await apiPost("/api/payment/create-session", { registrationId: reg.id });
  assert("Payment session created", payRes.ok, `status=${payRes.status}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;

  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 7600 cents", stripeSession.amount_total === 7600, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  if (lineItems[0]) {
    const product = lineItems[0].price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Product → adult-daily", productId?.includes("adult-daily") ?? false, `product=${productId}`);
  }

  step("Simulating webhook…");
  await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 7600,
      metadata: { registration_id: reg.id, event_id: EVENT_ID },
    })
  );

  await new Promise((r) => setTimeout(r, 1500));
  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed", `got ${finalReg?.status}`);

  const payment = await getPayment(sessionId);
  assert("Payment completed", payment?.status === "completed", `got ${payment?.status}`);

  return reg.id;
}

/* ================================================================== */
/*  FLOW 6: Solo Child Full ($50) — bonus coverage                     */
/* ================================================================== */

async function flow6_soloChildFull() {
  section("Flow 6: Solo Child Full Conference ($50) — harmonika.hn@gmail.com");

  step("Creating child registration…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Kiddo",
    lastName: "TestChild",
    email: "harmonika.hn@gmail.com",
    phone: "+1-555-111-0006",
    dateOfBirth: "2019-09-01", // age 6 → child, $50
    isFullDuration: true,
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $50", Number(reg.computed_amount) === 50, `got $${reg.computed_amount}`);
  assert("Category = child", reg.category === "child");
  assert("Code = FULL_CHILD", reg.explanation_code === "FULL_CHILD");

  step("Creating payment session…");
  const payRes = await apiPost("/api/payment/create-session", { registrationId: reg.id });
  assert("Payment session created", payRes.ok, `status=${payRes.status}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;

  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 5000 cents", stripeSession.amount_total === 5000, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  if (lineItems[0]) {
    const product = lineItems[0].price?.product;
    const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;
    assert("Product → child-full", productId?.includes("child-full") ?? false, `product=${productId}`);
  }

  step("Simulating webhook…");
  await sendWebhook(
    buildCheckoutCompletedEvent({
      sessionId,
      amountTotal: 5000,
      metadata: { registration_id: reg.id, event_id: EVENT_ID },
    })
  );

  await new Promise((r) => setTimeout(r, 1500));
  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed", `got ${finalReg?.status}`);

  return reg.id;
}

/* ================================================================== */
/*  Main runner                                                        */
/* ================================================================== */

async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║  FellowFlow — Stripe Integration E2E Tests       ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.dim}Base URL:  ${BASE_URL}${c.reset}`);
  console.log(`  ${c.dim}Event:     Midwest Conference 2026${c.reset}`);
  console.log(`  ${c.dim}Date:      ${new Date().toISOString().slice(0, 10)}${c.reset}\n`);

  // Check dev server
  step("Checking dev server…");
  try {
    const health = await fetch(`${BASE_URL}`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok && health.status !== 404) throw new Error(`status ${health.status}`);
    step(`Dev server is running at ${BASE_URL}`);
  } catch (e) {
    console.error(`\n${c.red}${c.bold}ERROR: Dev server not reachable at ${BASE_URL}${c.reset}`);
    console.error(`${c.dim}Start it with: npm run dev${c.reset}\n`);
    process.exit(1);
  }

  // Cleanup
  await cleanup();

  // Run flows
  try { await flow1_soloAdultFull(); } catch (e) { console.error(`  ${FAIL} Flow 1 threw: ${e}`); failedTests++; }
  try { await flow2_soloYouthFull(); } catch (e) { console.error(`  ${FAIL} Flow 2 threw: ${e}`); failedTests++; }
  try { await flow3_groupFamily(); } catch (e) { console.error(`  ${FAIL} Flow 3 threw: ${e}`); failedTests++; }
  try { await flow4_kotePlusMeals(); } catch (e) { console.error(`  ${FAIL} Flow 4 threw: ${e}`); failedTests++; }
  try { await flow5_partialAdult(); } catch (e) { console.error(`  ${FAIL} Flow 5 threw: ${e}`); failedTests++; }
  try { await flow6_soloChildFull(); } catch (e) { console.error(`  ${FAIL} Flow 6 threw: ${e}`); failedTests++; }

  // Optional cleanup
  if (!SKIP_CLEANUP) {
    section("Post-test Cleanup");
    await cleanup();
  } else {
    step("Skipping cleanup (--skip-cleanup flag set)");
  }

  // Summary
  console.log(`\n${c.bold}${c.magenta}══════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}  Results: ${passedTests}/${totalTests} passed${c.reset}`);
  if (failedTests > 0) {
    console.log(`  ${c.red}${failedTests} failed:${c.reset}`);
    for (const f of failures) {
      console.log(`    ${c.red}• ${f}${c.reset}`);
    }
  } else {
    console.log(`  ${c.green}${c.bold}All tests passed!${c.reset}`);
  }
  console.log(`${c.bold}${c.magenta}══════════════════════════════════════════════════${c.reset}\n`);

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${c.red}Fatal error:${c.reset}`, err);
  process.exit(1);
});
