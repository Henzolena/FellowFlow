import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registrationProductId, mealProductId, surchargeProductId } from "./product-map";

const PRICING_CONFIG_ID = "3d325f27-ce87-4317-bd27-9549b85dda2a";
const STRIPPED = "3d325f27ce874317bd279549b85dda2a";

describe("registrationProductId", () => {
  it("maps FULL_ADULT to adult-full", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "FULL_ADULT")).toBe(
      `ff-pc-${STRIPPED}-adult-full`
    );
  });

  it("maps FULL_YOUTH to youth-full", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "FULL_YOUTH")).toBe(
      `ff-pc-${STRIPPED}-youth-full`
    );
  });

  it("maps FULL_CHILD to child-full", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "FULL_CHILD")).toBe(
      `ff-pc-${STRIPPED}-child-full`
    );
  });

  it("maps PARTIAL_ADULT to adult-daily", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "PARTIAL_ADULT")).toBe(
      `ff-pc-${STRIPPED}-adult-daily`
    );
  });

  it("maps PARTIAL_YOUTH to youth-daily", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "PARTIAL_YOUTH")).toBe(
      `ff-pc-${STRIPPED}-youth-daily`
    );
  });

  it("maps PARTIAL_CHILD to child-daily", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "PARTIAL_CHILD")).toBe(
      `ff-pc-${STRIPPED}-child-daily`
    );
  });

  it("maps KOTE to kote-daily", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "KOTE")).toBe(
      `ff-pc-${STRIPPED}-kote-daily`
    );
  });

  it("returns null for FREE_INFANT", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "FREE_INFANT")).toBeNull();
  });

  it("returns null for unknown codes", () => {
    expect(registrationProductId(PRICING_CONFIG_ID, "UNKNOWN")).toBeNull();
  });
});

describe("mealProductId", () => {
  it("strips dashes from service catalog UUID", () => {
    expect(mealProductId("495d1247-37ea-4141-92a3-c78fc1fc689d")).toBe(
      "ff-sc-495d124737ea414192a3c78fc1fc689d"
    );
  });

  it("handles already-stripped IDs", () => {
    expect(mealProductId("abc123")).toBe("ff-sc-abc123");
  });
});

describe("surchargeProductId", () => {
  const LATE = "prod_late123";
  const ONSITE = "prod_onsite456";

  beforeEach(() => {
    vi.stubEnv("STRIPE_PRODUCT_LATE_FEE", LATE);
    vi.stubEnv("STRIPE_PRODUCT_ONSITE_FEE", ONSITE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps 'Late Registration Fee' to STRIPE_PRODUCT_LATE_FEE env", () => {
    expect(surchargeProductId("Late Registration Fee")).toBe(LATE);
  });

  it("maps 'On-Site Registration Fee' to STRIPE_PRODUCT_ONSITE_FEE env", () => {
    expect(surchargeProductId("On-Site Registration Fee")).toBe(ONSITE);
  });

  it("is case-insensitive for label matching", () => {
    expect(surchargeProductId("LATE registration fee")).toBe(LATE);
    expect(surchargeProductId("ON-SITE REGISTRATION FEE")).toBe(ONSITE);
  });

  it("returns null for null label", () => {
    expect(surchargeProductId(null)).toBeNull();
  });

  it("returns null for unknown label", () => {
    expect(surchargeProductId("Unknown Surcharge")).toBeNull();
  });

  it("returns null when env vars are not set", () => {
    vi.unstubAllEnvs();
    delete process.env.STRIPE_PRODUCT_LATE_FEE;
    delete process.env.STRIPE_PRODUCT_ONSITE_FEE;
    expect(surchargeProductId("Late Registration Fee")).toBeNull();
    expect(surchargeProductId("On-Site Registration Fee")).toBeNull();
  });
});
