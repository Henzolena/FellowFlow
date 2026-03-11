import { describe, it, expect } from "vitest";
import {
  personalInfoSchema,
  registrationSchema,
  groupRegistrantSchema,
  groupRegistrationSchema,
  eventSchema,
  pricingSchema,
} from "./registration";

// ─── personalInfoSchema ───

describe("personalInfoSchema", () => {
  it("accepts valid personal info", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      phone: "+1234567890",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("requires phone", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "",
      lastName: "Doe",
      email: "john@example.com",
      phone: "+1234567890",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty lastName", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "John",
      lastName: "",
      email: "john@example.com",
      phone: "+1234567890",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "John",
      lastName: "Doe",
      email: "not-an-email",
      phone: "+1234567890",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty dateOfBirth", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      phone: "+1234567890",
      dateOfBirth: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects names exceeding 100 characters", () => {
    const result = personalInfoSchema.safeParse({
      firstName: "A".repeat(101),
      lastName: "Doe",
      email: "john@example.com",
      phone: "+1234567890",
      dateOfBirth: "1990-01-01",
    });
    expect(result.success).toBe(false);
  });
});

// ─── registrationSchema ───

describe("registrationSchema", () => {
  const validBase = {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "+1234567890",
    dateOfBirth: "1990-01-01",
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    isFullDuration: true,
  };

  it("accepts valid full-duration registration", () => {
    const result = registrationSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts valid partial registration with motel and numDays", () => {
    const result = registrationSchema.safeParse({
      ...validBase,
      isFullDuration: false,
      isStayingInMotel: true,
      numDays: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID eventId", () => {
    const result = registrationSchema.safeParse({
      ...validBase,
      eventId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects numDays of 0", () => {
    const result = registrationSchema.safeParse({
      ...validBase,
      isFullDuration: false,
      numDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative numDays", () => {
    const result = registrationSchema.safeParse({
      ...validBase,
      isFullDuration: false,
      numDays: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer numDays", () => {
    const result = registrationSchema.safeParse({
      ...validBase,
      isFullDuration: false,
      numDays: 2.5,
    });
    expect(result.success).toBe(false);
  });
});

// ─── groupRegistrantSchema ───

describe("groupRegistrantSchema", () => {
  it("accepts valid group registrant", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial attendance with numDays", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: false,
      isStayingInMotel: false,
      numDays: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing firstName", () => {
    const result = groupRegistrantSchema.safeParse({
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
    });
    expect(result.success).toBe(false);
  });
});

// ─── groupRegistrationSchema ───

describe("groupRegistrationSchema", () => {
  const validGroup = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    email: "group@example.com",
    phone: "+1234567890",
    registrants: [
      { firstName: "John", lastName: "Doe", dateOfBirth: "1990-01-01", isFullDuration: true },
    ],
  };

  it("accepts valid group registration", () => {
    const result = groupRegistrationSchema.safeParse(validGroup);
    expect(result.success).toBe(true);
  });

  it("accepts group with multiple registrants", () => {
    const result = groupRegistrationSchema.safeParse({
      ...validGroup,
      registrants: [
        { firstName: "John", lastName: "Doe", dateOfBirth: "1990-01-01", isFullDuration: true },
        { firstName: "Jane", lastName: "Doe", dateOfBirth: "1992-05-15", isFullDuration: false, numDays: 3 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty registrants array", () => {
    const result = groupRegistrationSchema.safeParse({
      ...validGroup,
      registrants: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 registrants", () => {
    const registrants = Array.from({ length: 21 }, (_, i) => ({
      firstName: `Person${i}`,
      lastName: "Test",
      dateOfBirth: "1990-01-01",
      isFullDuration: true,
    }));
    const result = groupRegistrationSchema.safeParse({
      ...validGroup,
      registrants,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email in group", () => {
    const result = groupRegistrationSchema.safeParse({
      ...validGroup,
      email: "bad-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional phone in group", () => {
    const result = groupRegistrationSchema.safeParse({
      ...validGroup,
      phone: "+1234567890",
    });
    expect(result.success).toBe(true);
  });
});

// ─── eventSchema ───

describe("eventSchema", () => {
  it("accepts valid event", () => {
    const result = eventSchema.safeParse({
      name: "Summer Conference",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    expect(result.success).toBe(true);
  });

  it("applies default thresholds", () => {
    const result = eventSchema.safeParse({
      name: "Summer Conference",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.adultAgeThreshold).toBe(18);
      expect(result.data.youthAgeThreshold).toBe(13);
    }
  });

  it("rejects empty event name", () => {
    const result = eventSchema.safeParse({
      name: "",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = eventSchema.safeParse({
      name: "A".repeat(201),
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    expect(result.success).toBe(false);
  });
});

// ─── pricingSchema ───

describe("pricingSchema", () => {
  it("accepts valid pricing config", () => {
    const result = pricingSchema.safeParse({
      adultFullPrice: 100,
      adultDailyPrice: 25,
      youthFullPrice: 75,
      youthDailyPrice: 20,
      childFullPrice: 50,
      childDailyPrice: 15,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.motelStayFree).toBe(true); // default
    }
  });

  it("allows zero prices", () => {
    const result = pricingSchema.safeParse({
      adultFullPrice: 0,
      adultDailyPrice: 0,
      youthFullPrice: 0,
      youthDailyPrice: 0,
      childFullPrice: 0,
      childDailyPrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative prices", () => {
    const result = pricingSchema.safeParse({
      adultFullPrice: -10,
      adultDailyPrice: 25,
      youthFullPrice: 75,
      youthDailyPrice: 20,
      childFullPrice: 50,
      childDailyPrice: 15,
    });
    expect(result.success).toBe(false);
  });

  it("overrides motelStayFree default", () => {
    const result = pricingSchema.safeParse({
      adultFullPrice: 100,
      adultDailyPrice: 25,
      youthFullPrice: 75,
      youthDailyPrice: 20,
      childFullPrice: 50,
      childDailyPrice: 15,
      motelStayFree: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.motelStayFree).toBe(false);
    }
  });
});
