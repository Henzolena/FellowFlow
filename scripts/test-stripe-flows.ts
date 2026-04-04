#!/usr/bin/env npx tsx
/**
 * Production-grade end-to-end Stripe integration flow tests.
 *
 * Covers ALL registration fields: Church, City, Gender, Age range,
 * Service Language (Amharic/English), Age Band, Grade Level, T-shirt,
 * Meal pre-selection, Dorm auto-assignment, and Stripe product mapping.
 *
 * Prerequisites:
 *   1. Dev server running:  npm run dev
 *   2. .env.local configured with Stripe test keys (FellowFlow sandbox)
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

/* ── Real churches from DB ── */
const CHURCHES = {
  austin: { id: "f128fb9a-b99e-4443-b410-4d8933a1dfae", city: "Austin, TX" },
  allen:  { id: "70c62a10-b583-4dcb-aab7-a14ec707d29f", city: "Allen, TX" },
  kansas: { id: "955afe03-7443-4204-94c0-db78d2c5b3fa", city: "Olathe, KS" },
  houston:{ id: "d0bed6c4-8e9e-4552-ad68-499f29176212", city: "Missouri City, TX" },
  dallas: { id: "c745ec72-72dd-4b02-86d8-f284a7e74c1f", city: "Garland, TX" },
  irving: { id: "18da8c4a-84d4-4c05-bdb8-eae2fc12ac61", city: "Irving, TX" },
};

/* ── Expected dorm mappings per city ── */
const CITY_DORMS: Record<string, string> = {
  "Austin, TX": "Peace Dorm",
  "Allen, TX": "Heavenly Sunshine Dorm",
  "Olathe, KS": "Faith Dorm",
  "Missouri City, TX": "Love Dorm 1",
  "Garland, TX": "Heavenly Sunshine Dorm",
  "Irving, TX": "Heavenly Sunshine Dorm",
};

/* ── Active meal service IDs (Jul 30 – Aug 2) ── */
const MEAL_IDS = {
  thuDinner:    "495d1247-37ea-4141-92a3-c78fc1fc689d",
  friBreakfast: "83aa9acd-e4ca-432f-bbe8-b5b898c6ccc8",
  friLunch:     "b28a3657-bb83-4438-a9bf-191a18616c11",
  friDinner:    "e3255973-5e5c-4315-afb8-8fa3d6f053cb",
  satBreakfast: "195eac1e-9bcf-4b9f-a266-ce343d9230d3",
  satLunch:     "eff42d9d-1b6c-4df7-a980-aa9a054f3fe0",
  satDinner:    "7baf227d-57f7-4ac3-b921-69dc6d4fcd3a",
  sunBreakfast: "f63aac78-45ae-4455-ba66-5d4ea933a564",
  sunLunch:     "8679d9a6-f454-4e2d-b316-489bdbdc7e76",
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
/*  Terminal colours & assertion harness                                */
/* ================================================================== */

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", magenta: "\x1b[35m",
};
const PASS = `${c.green}✔ PASS${c.reset}`;
const FAIL = `${c.red}✘ FAIL${c.reset}`;

let totalTests = 0, passedTests = 0, failedTests = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail = "") {
  totalTests++;
  if (condition) { passedTests++; console.log(`    ${PASS}  ${label}`); }
  else { failedTests++; failures.push(`${label}: ${detail}`); console.log(`    ${FAIL}  ${label}${detail ? ` — ${c.red}${detail}${c.reset}` : ""}`); }
}
function section(title: string) { console.log(`\n${c.bold}${c.cyan}━━━ ${title} ━━━${c.reset}`); }
function step(msg: string) { console.log(`  ${c.dim}→${c.reset} ${msg}`); }

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

async function sendWebhook(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET, timestamp: ts });
  const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

/* ================================================================== */
/*  DB helpers                                                         */
/* ================================================================== */

async function getRegistration(id: string) {
  const { data } = await supabase.from("registrations").select("*").eq("id", id).single();
  return data;
}

async function getPayment(stripeSessionId: string) {
  const { data } = await supabase.from("payments").select("*").eq("stripe_session_id", stripeSessionId).maybeSingle();
  return data;
}

async function getEntitlements(registrationId: string) {
  const { data } = await supabase.from("service_entitlements").select("*").eq("registration_id", registrationId);
  return data ?? [];
}

async function getMealPurchase(registrationId: string) {
  const { data } = await supabase.from("meal_purchases").select("*").eq("registration_id", registrationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function getLodgingAssignment(registrationId: string) {
  const { data } = await supabase
    .from("lodging_assignments")
    .select("*")
    .eq("registration_id", registrationId)
    .maybeSingle();
  return data;
}

async function getLodgingMotelName(bedId: string): Promise<string | null> {
  const { data } = await supabase
    .from("beds")
    .select("bed_label, rooms(motels(name))")
    .eq("id", bedId)
    .single();
  if (!data) return null;
  const rooms = data.rooms as unknown as { motels: { name: string } } | null;
  return rooms?.motels?.name ?? null;
}

/* ================================================================== */
/*  Stripe inspector                                                   */
/* ================================================================== */

async function inspectStripeSession(sessionId: string) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "line_items.data.price.product"],
  });
}

function getProductId(li: Stripe.LineItem): string | null {
  const product = li.price?.product;
  return typeof product === "string" ? product : (product as Stripe.Product)?.id ?? null;
}

/* ================================================================== */
/*  Cleanup                                                            */
/* ================================================================== */

async function cleanup() {
  step("Cleaning up previous test data…");

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, group_id")
    .eq("event_id", EVENT_ID)
    .in("email", TEST_EMAILS);

  if (!regs || regs.length === 0) { step("No previous test data found."); return; }

  const regIds = regs.map((r) => r.id);
  const groupIds = [...new Set(regs.map((r) => r.group_id).filter(Boolean))];
  step(`Found ${regIds.length} test registration(s) to clean up.`);

  // Delete in dependency order
  await supabase.from("service_entitlements").delete().in("registration_id", regIds);
  await supabase.from("lodging_assignments").delete().in("registration_id", regIds);
  await supabase.from("email_logs").delete().in("registration_id", regIds);

  const { data: mealPurchases } = await supabase.from("meal_purchases").select("id").in("registration_id", regIds);
  if (mealPurchases?.length) {
    const mpIds = mealPurchases.map((m) => m.id);
    await supabase.from("meal_purchase_items").delete().in("meal_purchase_id", mpIds);
    await supabase.from("meal_purchases").delete().in("id", mpIds);
  }

  await supabase.from("payments").delete().in("registration_id", regIds);
  if (groupIds.length > 0) {
    await supabase.from("email_logs").delete().in("group_id", groupIds);
    await supabase.from("payments").delete().in("group_id", groupIds);
  }

  await supabase.from("registrations").delete().in("id", regIds);
  step(`Cleaned up ${regIds.length} registrations and related data.`);
}

/* ================================================================== */
/*  Real Stripe charge helper                                          */
/* ================================================================== */

async function createRealStripeCharge(opts: {
  amountCents: number;
  description: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: opts.amountCents,
    currency: "usd",
    payment_method: "pm_card_visa",
    confirm: true,
    payment_method_types: ["card"],
    description: opts.description,
    metadata: opts.metadata ?? {},
  });
}

/* ================================================================== */
/*  Webhook event builders                                             */
/* ================================================================== */

function buildCheckoutCompletedEvent(opts: { sessionId: string; paymentIntentId?: string; amountTotal: number; metadata: Record<string, string> }) {
  return {
    id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: opts.sessionId, object: "checkout.session", payment_intent: opts.paymentIntentId ?? `pi_test_${Date.now()}`, amount_total: opts.amountTotal, currency: "usd", payment_status: "paid", status: "complete", metadata: opts.metadata } },
  };
}

/* ================================================================== */
/*  Shared: payment session + webhook + verify                         */
/* ================================================================== */

async function createPaymentAndVerify(opts: {
  registrationId?: string;
  groupId?: string;
  expectedCents: number;
  productSubstring: string;
  expectedLineItems: number;
  eventId?: string;
  description?: string;
}) {
  const body = opts.groupId ? { groupId: opts.groupId } : { registrationId: opts.registrationId };
  const payRes = await apiPost("/api/payment/create-session", body);
  assert("Payment session created", payRes.ok, `status=${payRes.status} body=${JSON.stringify(payRes.json)?.slice(0, 200)}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;
  step(`Stripe session: ${sessionId}`);

  const stripeSession = await inspectStripeSession(sessionId);
  assert(`Stripe amount = ${opts.expectedCents} cents`, stripeSession.amount_total === opts.expectedCents, `got ${stripeSession.amount_total}`);

  const lineItems = stripeSession.line_items?.data ?? [];
  assert(`${opts.expectedLineItems} line item(s)`, lineItems.length === opts.expectedLineItems, `got ${lineItems.length}`);

  if (lineItems[0] && opts.productSubstring) {
    assert(`Product contains '${opts.productSubstring}'`, getProductId(lineItems[0])?.includes(opts.productSubstring) ?? false, `product=${getProductId(lineItems[0])}`);
  }

  // Verify DB payment record
  const payment = await getPayment(sessionId);
  assert("Payment record in DB", !!payment);
  assert("Payment status = pending", payment?.status === "pending");

  // Create REAL Stripe charge so it shows in the dashboard
  step("Creating real Stripe charge (pm_card_visa)…");
  const realPI = await createRealStripeCharge({
    amountCents: opts.expectedCents,
    description: opts.description || "E2E Test Payment",
    metadata: {
      event_id: opts.eventId || EVENT_ID,
      ...(opts.registrationId ? { registration_id: opts.registrationId } : {}),
      ...(opts.groupId ? { group_id: opts.groupId } : {}),
      checkout_session_id: sessionId,
      test: "true",
    },
  });
  assert("Real Stripe charge succeeded", realPI.status === "succeeded");
  step(`PaymentIntent: ${realPI.id} ($${(realPI.amount / 100).toFixed(2)})`);

  // Send webhook with real PI ID so DB links correctly
  step("Sending checkout.session.completed webhook…");
  const metadata: Record<string, string> = { event_id: opts.eventId || EVENT_ID };
  if (opts.registrationId) metadata.registration_id = opts.registrationId;
  if (opts.groupId) {
    metadata.group_id = opts.groupId;
    const { data: firstReg } = await supabase.from("registrations").select("id").eq("group_id", opts.groupId).limit(1).single();
    if (firstReg) metadata.registration_id = firstReg.id;
  }

  const webhookRes = await sendWebhook(buildCheckoutCompletedEvent({ sessionId, paymentIntentId: realPI.id, amountTotal: opts.expectedCents, metadata }));
  assert("Webhook accepted", webhookRes.ok, `status=${webhookRes.status}`);

  await new Promise((r) => setTimeout(r, 1500));

  const finalPayment = await getPayment(sessionId);
  assert("Payment status = completed", finalPayment?.status === "completed", `got ${finalPayment?.status}`);

  return { sessionId, stripeSession, lineItems, paymentIntentId: realPI.id };
}

/* ================================================================== */
/*  Shared: verify registration DB fields                              */
/* ================================================================== */

function verifyRegFields(reg: Record<string, unknown>, expected: Record<string, unknown>) {
  for (const [key, val] of Object.entries(expected)) {
    const actual = reg[key];
    const match = JSON.stringify(actual) === JSON.stringify(val);
    assert(`DB ${key} = ${JSON.stringify(val)}`, match, `got ${JSON.stringify(actual)}`);
  }
}

/* ================================================================== */
/*  FLOW 1: Solo Adult Full — Amharic, Austin church, Peace Dorm       */
/* ================================================================== */

async function flow1_soloAdultFull() {
  section("Flow 1: Solo Adult Full ($150) — Amharic, Austin Church → Peace Dorm");

  step("Creating solo registration with all production fields…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Henok",
    lastName: "TestAdult",
    email: "henokrobale@gmail.com",
    phone: "+1-555-111-0001",
    dateOfBirth: "1990-05-15",
    isFullDuration: true,
    gender: "male",
    city: "Austin, TX",
    churchId: CHURCHES.austin.id,
    serviceLanguage: "amharic",
    tshirtSize: "L",
  });

  assert("Registration created", status === 200, `status=${status} body=${JSON.stringify(json)?.slice(0, 200)}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Status is pending", reg.status === "pending");
  assert("Amount = $150", Number(reg.computed_amount) === 150, `got $${reg.computed_amount}`);

  // Verify all production fields saved to DB
  step("Verifying all production fields in DB…");
  const dbReg = await getRegistration(reg.id);
  verifyRegFields(dbReg!, {
    category: "adult",
    explanation_code: "FULL_ADULT",
    gender: "male",
    city: "Austin, TX",
    church_id: CHURCHES.austin.id,
    service_language: "amharic",
    tshirt_size: "L",
    attendance_type: "full_conference",
    access_tier: "FULL_ACCESS",
    public_confirmation_code: dbReg!.public_confirmation_code, // just check it exists
  });
  assert("public_confirmation_code is set", !!dbReg?.public_confirmation_code);
  assert("secure_token is set", !!dbReg?.secure_token);

  // Verify dorm auto-assignment
  step("Checking dorm auto-assignment (Austin, TX → Peace Dorm)…");
  assert("bedAssignment returned", !!json.bedAssignment, `got ${JSON.stringify(json.bedAssignment)}`);
  if (json.bedAssignment) {
    assert("Assigned to Peace Dorm", json.bedAssignment.dormName === "Peace Dorm", `got ${json.bedAssignment.dormName}`);
  }
  const lodging = await getLodgingAssignment(reg.id);
  assert("lodging_assignments record exists", !!lodging);

  // Stripe payment + webhook
  step("Creating payment session…");
  const payResult = await createPaymentAndVerify({
    registrationId: reg.id,
    expectedCents: 15000,
    productSubstring: "adult-full",
    expectedLineItems: 1,
    description: "E2E Flow 1: Solo Adult Full ($150) — Amharic, Austin",
  });

  // Verify final state
  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed", `got ${finalReg?.status}`);
  assert("confirmed_at is set", !!finalReg?.confirmed_at);

  const entitlements = await getEntitlements(reg.id);
  assert("Service entitlements created", entitlements.length > 0, `got ${entitlements.length}`);

  return reg.id;
}

/* ================================================================== */
/*  FLOW 2: Solo Youth Full — English, Teens, Allen → Heavenly Sunshine*/
/* ================================================================== */

async function flow2_soloYouthEnglish() {
  section("Flow 2: Solo Youth Full ($100) — English/Teens, Allen Church → Heavenly Sunshine");

  step("Creating youth registration with English service…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Harmony",
    lastName: "TestYouth",
    email: "harmonika.hn@gmail.com",
    phone: "+1-555-111-0002",
    dateOfBirth: "2013-03-10", // age 13 → youth
    isFullDuration: true,
    gender: "female",
    city: "Allen, TX",
    churchId: CHURCHES.allen.id,
    serviceLanguage: "english",
    serviceAgeBand: "teens",
    gradeLevel: "9th-10th",
    tshirtSize: "S",
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $100", Number(reg.computed_amount) === 100, `got $${reg.computed_amount}`);

  const dbReg = await getRegistration(reg.id);
  verifyRegFields(dbReg!, {
    category: "youth",
    explanation_code: "FULL_YOUTH",
    gender: "female",
    city: "Allen, TX",
    church_id: CHURCHES.allen.id,
    service_language: "english",
    service_age_band: "teens",
    grade_level: "9th-10th",
    tshirt_size: "S",
  });

  // Dorm assignment
  step("Checking dorm (Allen, TX → Heavenly Sunshine Dorm)…");
  assert("bedAssignment returned", !!json.bedAssignment);
  if (json.bedAssignment) {
    assert("Assigned to Heavenly Sunshine Dorm", json.bedAssignment.dormName === "Heavenly Sunshine Dorm", `got ${json.bedAssignment.dormName}`);
  }

  // Payment + webhook
  await createPaymentAndVerify({
    registrationId: reg.id,
    expectedCents: 10000,
    productSubstring: "youth-full",
    expectedLineItems: 1,
    description: "E2E Flow 2: Solo Youth Full ($100) — English, Allen",
  });

  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed");

  return reg.id;
}

/* ================================================================== */
/*  FLOW 3: Group — Adult + Child + Infant, Kansas church, Meals       */
/* ================================================================== */

async function flow3_groupFamily() {
  section("Flow 3: Group (Adult $150 + Child $50 + Infant FREE) — Kansas Church → Faith Dorm");

  step("Creating group with church, city, gender, language, meals…");
  const { status, json } = await apiPost("/api/registration/create-group", {
    eventId: EVENT_ID,
    email: "henzolina.s.j@gmail.com",
    phone: "+1-555-333-0003",
    registrants: [
      {
        firstName: "Parent",
        lastName: "TestGroup",
        dateOfBirth: "1985-08-20", // age 40 → adult
        gender: "male",
        city: "Olathe, KS",
        churchId: CHURCHES.kansas.id,
        isFullDuration: true,
        serviceLanguage: "amharic",
        tshirtSize: "XL",
        mealServiceIds: [MEAL_IDS.thuDinner, MEAL_IDS.friBreakfast, MEAL_IDS.friLunch],
      },
      {
        firstName: "Kid",
        lastName: "TestGroup",
        dateOfBirth: "2019-01-15", // age 7 → child
        gender: "female",
        city: "Olathe, KS",
        churchId: CHURCHES.kansas.id,
        isFullDuration: true,
        serviceLanguage: "english",
        serviceAgeBand: "children",
        tshirtSize: "XS",
        mealServiceIds: [MEAL_IDS.friBreakfast, MEAL_IDS.friLunch],
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
  const regs = json.registrations as Record<string, unknown>[];
  assert("3 registrations returned", regs?.length === 3, `got ${regs?.length}`);

  // Verify pricing: Adult($150) + Child($50) + Infant($0) + Meals(3×$12 + 2×$8) = $200 + $52 = $252
  // Meals: Parent=3 adult meals ($12 each = $36), Kid=2 child meals ($8 each = $16)
  assert("Subtotal = $200", json.subtotal === 200, `got ${json.subtotal}`);
  assert("Meal total = $52", json.mealTotal === 52, `got ${json.mealTotal}`);
  assert("Grand total = $252", json.grandTotal === 252, `got ${json.grandTotal}`);
  assert("Infant is free", Number(regs[2]?.computed_amount) === 0);

  // Verify DB fields for parent
  step("Verifying parent DB fields…");
  const parentReg = await getRegistration(regs[0].id as string);
  verifyRegFields(parentReg!, {
    gender: "male",
    city: "Olathe, KS",
    church_id: CHURCHES.kansas.id,
    service_language: "amharic",
    tshirt_size: "XL",
  });
  assert("Parent meal IDs saved", parentReg?.selected_meal_ids?.length === 3, `got ${parentReg?.selected_meal_ids?.length}`);

  // Verify DB fields for child
  step("Verifying child DB fields…");
  const childReg = await getRegistration(regs[1].id as string);
  verifyRegFields(childReg!, {
    gender: "female",
    service_language: "english",
    service_age_band: "children",
    tshirt_size: "XS",
  });
  assert("Child meal IDs saved", childReg?.selected_meal_ids?.length === 2, `got ${childReg?.selected_meal_ids?.length}`);

  // Verify dorm assignments for non-infants
  step("Checking dorm assignments (Olathe, KS → Faith Dorm)…");
  const parentLodging = await getLodgingAssignment(regs[0].id as string);
  assert("Parent has lodging assignment", !!parentLodging);
  if (parentLodging) {
    const parentMotel = await getLodgingMotelName(parentLodging.bed_id);
    assert("Parent → Faith Dorm", parentMotel === "Faith Dorm", `got ${parentMotel}`);
  }
  const childLodging = await getLodgingAssignment(regs[1].id as string);
  assert("Child has lodging assignment", !!childLodging);
  if (childLodging) {
    const childMotel = await getLodgingMotelName(childLodging.bed_id);
    assert("Child → Faith Dorm", childMotel === "Faith Dorm", `got ${childMotel}`);
  }

  // Payment + webhook
  step("Creating group payment session…");
  const payRes = await apiPost("/api/payment/create-session", { groupId });
  assert("Payment session created", payRes.ok, `status=${payRes.status}`);
  if (!payRes.json?.sessionId) return null;

  const sessionId = payRes.json.sessionId as string;
  const stripeSession = await inspectStripeSession(sessionId);
  assert("Stripe amount = 25200 cents", stripeSession.amount_total === 25200, `got ${stripeSession.amount_total}`);

  // Line items: adult-full + child-full + 3 adult meals + 2 child meals = 7
  const lineItems = stripeSession.line_items?.data ?? [];
  assert("7 line items (2 reg + 5 meals, infant excluded)", lineItems.length === 7, `got ${lineItems.length}`);

  // Create real Stripe charge
  step("Creating real Stripe charge (pm_card_visa)…");
  const groupPI = await createRealStripeCharge({
    amountCents: 25200,
    description: "E2E Flow 3: Group (Adult $150 + Child $50 + 5 Meals $52)",
    metadata: { group_id: groupId, event_id: EVENT_ID, checkout_session_id: sessionId, test: "true" },
  });
  assert("Real Stripe charge succeeded", groupPI.status === "succeeded");
  step(`PaymentIntent: ${groupPI.id} ($${(groupPI.amount / 100).toFixed(2)})`);

  // Webhook
  step("Sending checkout.session.completed webhook…");
  const firstRegId = regs[0].id as string;
  await sendWebhook(buildCheckoutCompletedEvent({
    sessionId,
    paymentIntentId: groupPI.id,
    amountTotal: 25200,
    metadata: { registration_id: firstRegId, group_id: groupId, event_id: EVENT_ID },
  }));

  await new Promise((r) => setTimeout(r, 2000));
  for (const reg of regs) {
    const r = await getRegistration(reg.id as string);
    assert(`${r?.category} registration confirmed`, r?.status === "confirmed", `got ${r?.status}`);
  }

  return { groupId, regs };
}

/* ================================================================== */
/*  FLOW 4: KOTE + Meals — English Young Adults, no dorm               */
/* ================================================================== */

async function flow4_kotePlusMeals() {
  section("Flow 4: KOTE 2 days ($20) + Meals ($24) — English Young Adults, custom church, NO dorm");

  step("Creating KOTE with English service, grade, custom church…");
  const { status, json } = await apiPost("/api/registration/create-group", {
    eventId: EVENT_ID,
    email: "henzolina2@gmail.com",
    phone: "+1-555-444-0004",
    registrants: [
      {
        firstName: "Kote",
        lastName: "TestWalker",
        dateOfBirth: "1995-12-01", // age 30 → adult
        gender: "male",
        churchNameCustom: "Community Church of Dallas",
        isFullDuration: false,
        numDays: 2,
        selectedDays: [1, 2],
        attendanceType: "kote",
        serviceLanguage: "english",
        serviceAgeBand: "young_adults",
        gradeLevel: "college_career",
        tshirtSize: "M",
      },
    ],
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registrations?.[0]) return null;

  const reg = json.registrations[0] as Record<string, unknown>;
  assert("Amount = $20", Number(reg.computed_amount) === 20, `got $${reg.computed_amount}`);
  assert("Attendance type = kote", reg.attendance_type === "kote");

  const groupId = json.groupId as string;

  // Verify DB fields
  step("Verifying KOTE DB fields…");
  const dbReg = await getRegistration(reg.id as string);
  verifyRegFields(dbReg!, {
    attendance_type: "kote",
    access_tier: "KOTE_ACCESS",
    church_name_custom: "Community Church of Dallas",
    service_language: "english",
    service_age_band: "young_adults",
    grade_level: "college_career",
    tshirt_size: "M",
  });

  // KOTE should NOT get dorm
  step("Verifying NO dorm assigned (KOTE)…");
  const lodging = await getLodgingAssignment(reg.id as string);
  assert("No lodging assignment (KOTE)", !lodging);

  // Payment
  step("Creating KOTE payment session…");
  await createPaymentAndVerify({
    groupId,
    expectedCents: 2000,
    productSubstring: "kote-daily",
    expectedLineItems: 1,
    description: "E2E Flow 4: KOTE 2-day ($20) — English Young Adults",
  });

  const confirmedReg = await getRegistration(reg.id as string);
  assert("KOTE registration confirmed", confirmedReg?.status === "confirmed");

  // ── Meal purchase ──
  step("Purchasing 2 meals (Fri Breakfast + Fri Lunch)…");
  const mealServiceIds = [MEAL_IDS.friBreakfast, MEAL_IDS.friLunch];
  const mealRes = await apiPost("/api/meals/purchase", {
    secureToken: confirmedReg?.secure_token,
    serviceIds: mealServiceIds,
  });
  assert("Meal purchase initiated", mealRes.ok, `status=${mealRes.status}`);
  if (!mealRes.json?.sessionId) return null;

  const mealSessionId = mealRes.json.sessionId as string;
  const mealSession = await inspectStripeSession(mealSessionId);
  assert("Meal amount = 2400 cents (adult $12×2)", mealSession.amount_total === 2400, `got ${mealSession.amount_total}`);

  const mealLineItems = mealSession.line_items?.data ?? [];
  assert("2 meal line items", mealLineItems.length === 2);
  for (const li of mealLineItems) {
    assert("Meal product linked (ff-sc-...)", getProductId(li)?.startsWith("ff-sc-") ?? false);
  }

  // Real Stripe charge for meals
  step("Creating real Stripe charge for meals (pm_card_visa)…");
  const mealPI = await createRealStripeCharge({
    amountCents: 2400,
    description: "E2E Flow 4: Meal Purchase (2× adult $12)",
    metadata: { registration_id: reg.id as string, event_id: EVENT_ID, checkout_session_id: mealSessionId, type: "meal_purchase", test: "true" },
  });
  assert("Real meal charge succeeded", mealPI.status === "succeeded");
  step(`Meal PaymentIntent: ${mealPI.id} ($${(mealPI.amount / 100).toFixed(2)})`);

  // Meal webhook
  const mealPurchase = await getMealPurchase(reg.id as string);
  assert("Meal purchase record in DB", !!mealPurchase);
  if (mealPurchase) {
    step("Sending meal purchase webhook…");
    await sendWebhook(buildCheckoutCompletedEvent({
      sessionId: mealSessionId,
      paymentIntentId: mealPI.id,
      amountTotal: 2400,
      metadata: { registration_id: reg.id as string, meal_purchase_id: mealPurchase.id, type: "meal_purchase" },
    }));

    await new Promise((r) => setTimeout(r, 1500));
    const updated = await getMealPurchase(reg.id as string);
    assert("Meal purchase completed", updated?.payment_status === "completed", `got ${updated?.payment_status}`);

    const ents = await getEntitlements(reg.id as string);
    const mealEnts = ents.filter((e) => mealServiceIds.includes(e.service_id));
    assert("Meal entitlements created (2)", mealEnts.length === 2, `got ${mealEnts.length}`);
  }

  return reg.id;
}

/* ================================================================== */
/*  FLOW 5: Partial Adult — Dallas church, Garland city → Heavenly     */
/* ================================================================== */

async function flow5_partialAdult() {
  section("Flow 5: Partial 2 days ($76) — Dallas Church, Garland, TX → Heavenly Sunshine");

  step("Creating partial registration with church + city…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Partial",
    lastName: "TestDorm",
    email: "henokrobale@gmail.com",
    phone: "+1-555-555-0005",
    dateOfBirth: "2000-06-15", // age 26 → adult
    isFullDuration: false,
    isStayingInMotel: false,
    numDays: 2,
    selectedDays: [1, 2],
    attendanceType: "partial",
    gender: "female",
    city: "Garland, TX",
    churchId: CHURCHES.dallas.id,
    serviceLanguage: "amharic",
    tshirtSize: "M",
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $76", Number(reg.computed_amount) === 76, `got $${reg.computed_amount}`);
  assert("Code = PARTIAL_ADULT", reg.explanation_code === "PARTIAL_ADULT");

  // Verify DB fields
  const dbReg = await getRegistration(reg.id);
  verifyRegFields(dbReg!, {
    gender: "female",
    city: "Garland, TX",
    church_id: CHURCHES.dallas.id,
    attendance_type: "partial",
    service_language: "amharic",
    tshirt_size: "M",
  });

  // Dorm
  step("Checking dorm (Garland, TX → Heavenly Sunshine Dorm)…");
  assert("bedAssignment returned", !!json.bedAssignment);
  if (json.bedAssignment) {
    assert("Assigned to Heavenly Sunshine Dorm", json.bedAssignment.dormName === "Heavenly Sunshine Dorm", `got ${json.bedAssignment.dormName}`);
  }

  // Payment + webhook
  await createPaymentAndVerify({
    registrationId: reg.id,
    expectedCents: 7600,
    productSubstring: "adult-daily",
    expectedLineItems: 1,
    description: "E2E Flow 5: Partial 2-day ($76) — Dallas, Garland",
  });

  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed");

  return reg.id;
}

/* ================================================================== */
/*  FLOW 6: Child Full — church-based city resolution for dorm         */
/* ================================================================== */

async function flow6_childChurchDorm() {
  section("Flow 6: Child Full ($50) — Houston Church → city resolved → Love Dorm 1");

  step("Creating child with churchId but NO direct city…");
  const { status, json } = await apiPost("/api/registration/create", {
    eventId: EVENT_ID,
    firstName: "Kiddo",
    lastName: "TestChild",
    email: "harmonika.hn@gmail.com",
    phone: "+1-555-666-0006",
    dateOfBirth: "2019-09-01", // age 6 → child
    isFullDuration: true,
    gender: "male",
    churchId: CHURCHES.houston.id, // city: Missouri City, TX → Love Dorm 1
    serviceLanguage: "english",
    serviceAgeBand: "children",
    tshirtSize: "XS",
  });

  assert("Registration created", status === 200, `status=${status}`);
  if (!json?.registration) return null;

  const reg = json.registration;
  assert("Amount = $50", Number(reg.computed_amount) === 50);
  assert("Category = child", reg.category === "child");

  const dbReg = await getRegistration(reg.id);
  verifyRegFields(dbReg!, {
    church_id: CHURCHES.houston.id,
    service_language: "english",
    service_age_band: "children",
    tshirt_size: "XS",
  });

  // Dorm should be resolved via church → city → dorm mapping
  step("Checking dorm (church city Missouri City, TX → Love Dorm 1)…");
  assert("bedAssignment returned", !!json.bedAssignment, `got ${JSON.stringify(json.bedAssignment)}`);
  if (json.bedAssignment) {
    assert("Assigned to Love Dorm 1", json.bedAssignment.dormName === "Love Dorm 1", `got ${json.bedAssignment.dormName}`);
  }

  // Payment + webhook
  await createPaymentAndVerify({
    registrationId: reg.id,
    expectedCents: 5000,
    productSubstring: "child-full",
    expectedLineItems: 1,
    description: "E2E Flow 6: Child Full ($50) — Houston Church",
  });

  const finalReg = await getRegistration(reg.id);
  assert("Registration confirmed", finalReg?.status === "confirmed");

  return reg.id;
}

/* ================================================================== */
/*  Main runner                                                        */
/* ================================================================== */

async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║  FellowFlow — Production E2E Stripe Integration Tests        ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.dim}Base URL:  ${BASE_URL}${c.reset}`);
  console.log(`  ${c.dim}Event:     Midwest Conference 2026${c.reset}`);
  console.log(`  ${c.dim}Date:      ${new Date().toISOString().slice(0, 10)}${c.reset}`);
  console.log(`  ${c.dim}Fields:    Church, City, Gender, Language, AgeBand, Grade, T-shirt, Dorm${c.reset}\n`);

  // Check dev server
  step("Checking dev server…");
  try {
    await fetch(`${BASE_URL}`, { signal: AbortSignal.timeout(3000) });
    step(`Dev server is running at ${BASE_URL}`);
  } catch {
    console.error(`\n${c.red}${c.bold}ERROR: Dev server not reachable at ${BASE_URL}${c.reset}`);
    console.error(`${c.dim}Start it with: npm run dev${c.reset}\n`);
    process.exit(1);
  }

  await cleanup();

  const flows = [
    { name: "Flow 1", fn: flow1_soloAdultFull },
    { name: "Flow 2", fn: flow2_soloYouthEnglish },
    { name: "Flow 3", fn: flow3_groupFamily },
    { name: "Flow 4", fn: flow4_kotePlusMeals },
    { name: "Flow 5", fn: flow5_partialAdult },
    { name: "Flow 6", fn: flow6_childChurchDorm },
  ];

  for (const { name, fn } of flows) {
    try { await fn(); } catch (e) { console.error(`  ${FAIL} ${name} threw: ${e}`); failedTests++; }
  }

  if (!SKIP_CLEANUP) { section("Post-test Cleanup"); await cleanup(); }
  else { step("Skipping cleanup (--skip-cleanup flag set)"); }

  // Summary
  console.log(`\n${c.bold}${c.magenta}══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}  Results: ${passedTests}/${totalTests} passed${c.reset}`);
  if (failedTests > 0) {
    console.log(`  ${c.red}${failedTests} failed:${c.reset}`);
    for (const f of failures) console.log(`    ${c.red}• ${f}${c.reset}`);
  } else {
    console.log(`  ${c.green}${c.bold}All tests passed!${c.reset}`);
  }
  console.log(`${c.bold}${c.magenta}══════════════════════════════════════════════════════════════${c.reset}\n`);

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch((err) => { console.error(`\n${c.red}Fatal error:${c.reset}`, err); process.exit(1); });
