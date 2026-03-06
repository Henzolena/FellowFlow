import { test, expect } from "@playwright/test";

// The active event in the DB
const EVENT_ID = "20bad896-a715-4519-a533-62dd64f7233c";

test.describe("Landing Page", () => {
  test("loads and shows event card with register button", async ({ page }) => {
    await page.goto("/");

    // Event card should be visible
    await expect(page.getByText("FellowFlow Midwest Conference 2026")).toBeVisible({ timeout: 10_000 });

    // Register button should link to the event
    const registerLink = page.getByRole("link", { name: /register/i }).first();
    await expect(registerLink).toBeVisible();
  });

  test("how-it-works section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#how-it-works")).toBeVisible();
  });
});

test.describe("Events Listing", () => {
  test("shows active events with register links", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("FellowFlow Midwest Conference 2026")).toBeVisible();
  });
});

test.describe("Registration Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/register/${EVENT_ID}`);
    // Wait for the wizard to load
    await expect(page.getByText("Who is Attending")).toBeVisible({ timeout: 10_000 });
  });

  test("Step 0: wizard loads with one empty registrant", async ({ page }) => {
    // Should show "Person 1" placeholder
    await expect(page.getByText(/Person 1/)).toBeVisible();
    // "Next" button should be disabled (no data entered)
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    await expect(nextBtn).toBeDisabled();
  });

  test("Step 0: can fill in registrant details", async ({ page }) => {
    // First registrant card should be expanded by default
    const firstNameInput = page.getByPlaceholder("John");
    const lastNameInput = page.getByPlaceholder("Doe");

    await firstNameInput.fill("Test");
    await lastNameInput.fill("User");

    // Name should update in the card header
    await expect(page.getByText("Test User")).toBeVisible();

    // Select age range (adult)
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /18\+/i }).click();

    // Select full duration
    await page.getByLabel(/yes.*full.*conference/i).check();

    // Next button should now be enabled
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    await expect(nextBtn).toBeEnabled();
  });

  test("Step 0: can add and remove registrants", async ({ page }) => {
    // Click "Add Another Person"
    await page.getByRole("button", { name: /add another person/i }).click();

    // Should show 2 registrants
    await expect(page.getByText("Person 2")).toBeVisible();

    // Badge should show count
    await expect(page.locator("text=2").first()).toBeVisible();
  });

  test("Step 0 → Step 1: navigate to contact info", async ({ page }) => {
    // Fill in a complete registrant (infant = free)
    await page.getByPlaceholder("John").fill("Baby");
    await page.getByPlaceholder("Doe").fill("Smith");

    // Select age range (infant)
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();

    // Select full duration
    await page.getByLabel(/yes.*full.*conference/i).check();

    // Click Next
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Should now be on Step 1 (Contact Info)
    await expect(page.getByText("Contact Information")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/phone/i)).toBeVisible();
  });

  test("Step 1 → Step 2: navigate to review", async ({ page }) => {
    // Fill registrant
    await page.getByPlaceholder("John").fill("Baby");
    await page.getByPlaceholder("Doe").fill("Smith");
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await page.getByLabel(/yes.*full.*conference/i).check();

    // Go to Step 1
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Contact Information")).toBeVisible({ timeout: 5_000 });

    // Fill contact info
    await page.getByLabel(/email/i).fill("e2etest@example.com");
    await page.getByLabel(/phone/i).fill("5551234567");

    // Go to Step 2 (may trigger duplicate check)
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Should reach Review step (or duplicate dialog)
    const reviewOrDialog = page.getByText("Review").or(page.getByText("Existing Registration"));
    await expect(reviewOrDialog.first()).toBeVisible({ timeout: 10_000 });
  });

  test("Step 2: review shows registrant and pricing", async ({ page }) => {
    // Fill registrant
    await page.getByPlaceholder("John").fill("Baby");
    await page.getByPlaceholder("Doe").fill("Smith");
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await page.getByLabel(/yes.*full.*conference/i).check();

    // Step 1
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Contact Information")).toBeVisible({ timeout: 5_000 });
    await page.getByLabel(/email/i).fill("e2etest_review@example.com");

    // Step 2
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Handle duplicate dialog if it appears
    const proceedBtn = page.getByRole("button", { name: /proceed anyway/i });
    if (await proceedBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await proceedBtn.click();
    }

    // On review, should see the registrant info and pricing
    await expect(page.getByText("Baby Smith")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("e2etest_review@example.com")).toBeVisible();

    // Should show a submit/payment button
    const submitBtn = page.getByRole("button", { name: /complete registration|proceed to payment/i });
    await expect(submitBtn).toBeVisible();
  });

  test("sidebar shows pricing quote after filling registrant", async ({ page }) => {
    // Fill registrant
    await page.getByPlaceholder("John").fill("Adult");
    await page.getByPlaceholder("Doe").fill("Tester");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /18\+/i }).click();
    await page.getByLabel(/yes.*full.*conference/i).check();

    // Wait for debounced quote to load (400ms + network)
    await page.waitForTimeout(1500);

    // Sidebar should show a dollar amount or "Free"
    const sidebar = page.locator(".lg\\:block .sticky");
    await expect(sidebar.getByText(/\$[\d.]+|free/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("navigation: back button returns to previous step", async ({ page }) => {
    // Fill registrant and go to Step 1
    await page.getByPlaceholder("John").fill("Test");
    await page.getByPlaceholder("Doe").fill("Back");
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await page.getByLabel(/yes.*full.*conference/i).check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Contact Information")).toBeVisible({ timeout: 5_000 });

    // Click Back
    await page.getByRole("button", { name: /back/i }).click();

    // Should be back on Step 0
    await expect(page.getByText("Who is Attending")).toBeVisible({ timeout: 5_000 });
    // Data should be preserved
    await expect(page.getByText("Test Back")).toBeVisible();
  });
});

test.describe("API Health", () => {
  test("pricing quote API returns valid response", async ({ request }) => {
    const res = await request.post("/api/pricing/quote-group", {
      data: {
        eventId: EVENT_ID,
        registrants: [
          {
            dateOfBirth: "2000-01-01",
            isFullDuration: true,
            isStayingInMotel: false,
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("subtotal");
    expect(body).toHaveProperty("grandTotal");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toHaveProperty("amount");
    expect(body.items[0]).toHaveProperty("category");
  });

  test("pricing quote API validates input", async ({ request }) => {
    const res = await request.post("/api/pricing/quote-group", {
      data: { eventId: "not-a-uuid" },
    });
    expect(res.status()).toBe(400);
  });

  test("check-duplicate API works", async ({ request }) => {
    const res = await request.post("/api/registration/check-duplicate", {
      data: {
        eventId: EVENT_ID,
        email: "nonexistent_e2e_test@example.com",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("hasDuplicates");
  });

  test("create-session API rejects invalid input", async ({ request }) => {
    const res = await request.post("/api/payment/create-session", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
