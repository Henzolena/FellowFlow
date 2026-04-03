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

  it("accepts valid serviceLanguage", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "english",
    });
    expect(result.success).toBe(true);
  });

  it("accepts amharic serviceLanguage", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "amharic",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid serviceLanguage", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "spanish",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null serviceLanguage", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid gradeLevel", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "english",
      gradeLevel: "9th-10th",
    });
    expect(result.success).toBe(true);
  });

  it("accepts college_career gradeLevel", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "english",
      gradeLevel: "college_career",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid gradeLevel", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      gradeLevel: "kindergarten",
    });
    expect(result.success).toBe(false);
  });

  it("accepts serviceAgeBand as a short string", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceAgeBand: "13-17",
    });
    expect(result.success).toBe(true);
  });

  it("rejects serviceAgeBand exceeding max length", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceAgeBand: "this-string-is-way-too-long-for-band",
    });
    expect(result.success).toBe(false);
  });

  it("accepts tshirtSize with service fields", () => {
    const result = groupRegistrantSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "2010-05-15",
      isFullDuration: true,
      serviceLanguage: "english",
      serviceAgeBand: "13-17",
      gradeLevel: "9th-10th",
      tshirtSize: "M",
    });
    expect(result.success).toBe(true);
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
      expect(result.data.koteDailyPrice).toBe(10); // default
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

  it("overrides koteDailyPrice default", () => {
    const result = pricingSchema.safeParse({
      adultFullPrice: 100,
      adultDailyPrice: 25,
      youthFullPrice: 75,
      youthDailyPrice: 20,
      childFullPrice: 50,
      childDailyPrice: 15,
      koteDailyPrice: 15,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.koteDailyPrice).toBe(15);
    }
  });
});

// ─── Production-relevant validation scenarios ───

describe("groupRegistrantSchema — attendance types", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15" };

  it("accepts attendanceType: full_conference", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, isFullDuration: true, attendanceType: "full_conference" });
    expect(r.success).toBe(true);
  });

  it("accepts attendanceType: partial", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, isFullDuration: false, numDays: 2, attendanceType: "partial" });
    expect(r.success).toBe(true);
  });

  it("accepts attendanceType: kote", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, isFullDuration: false, numDays: 2, attendanceType: "kote" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid attendanceType", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, isFullDuration: true, attendanceType: "vip" });
    expect(r.success).toBe(false);
  });
});

describe("groupRegistrantSchema — mealServiceIds", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15", isFullDuration: true };

  it("accepts valid mealServiceIds (UUIDs)", () => {
    const r = groupRegistrantSchema.safeParse({
      ...base,
      mealServiceIds: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts empty mealServiceIds", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, mealServiceIds: [] });
    expect(r.success).toBe(true);
  });

  it("accepts omitted mealServiceIds", () => {
    const r = groupRegistrantSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejects non-UUID mealServiceIds", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, mealServiceIds: ["not-a-uuid"] });
    expect(r.success).toBe(false);
  });
});

describe("groupRegistrantSchema — selectedDays", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15", isFullDuration: false, numDays: 2 };

  it("accepts valid selectedDays", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, selectedDays: [1, 2] });
    expect(r.success).toBe(true);
  });

  it("accepts selectedDays with day 4 (Sunday)", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, numDays: 4, selectedDays: [1, 2, 3, 4] });
    expect(r.success).toBe(true);
  });

  it("rejects selectedDays with 0 (1-indexed)", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, selectedDays: [0, 1] });
    expect(r.success).toBe(false);
  });

  it("rejects selectedDays with negative numbers", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, selectedDays: [-1, 1] });
    expect(r.success).toBe(false);
  });
});

describe("groupRegistrantSchema — serviceAgeBand production values", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15", isFullDuration: true };

  it("accepts 'young_adults' (12 chars, within max 20)", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: "young_adults" });
    expect(r.success).toBe(true);
  });

  it("accepts 'nursery'", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: "nursery" });
    expect(r.success).toBe(true);
  });

  it("accepts 'children'", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: "children" });
    expect(r.success).toBe(true);
  });

  it("accepts 'teens'", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: "teens" });
    expect(r.success).toBe(true);
  });

  it("accepts 'adults'", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: "adults" });
    expect(r.success).toBe(true);
  });

  it("accepts null serviceAgeBand", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, serviceAgeBand: null });
    expect(r.success).toBe(true);
  });
});

describe("groupRegistrantSchema — tshirtSize values", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15", isFullDuration: true };

  for (const size of ["XS", "S", "M", "L", "XL", "2XL", "3XL"]) {
    it(`accepts tshirtSize: ${size}`, () => {
      const r = groupRegistrantSchema.safeParse({ ...base, tshirtSize: size });
      expect(r.success).toBe(true);
    });
  }

  it("rejects invalid tshirtSize", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, tshirtSize: "4XL" });
    expect(r.success).toBe(false);
  });

  it("accepts null tshirtSize", () => {
    const r = groupRegistrantSchema.safeParse({ ...base, tshirtSize: null });
    expect(r.success).toBe(true);
  });
});

describe("groupRegistrationSchema — phone validation", () => {
  const base = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    email: "test@example.com",
    registrants: [{ firstName: "John", lastName: "Doe", dateOfBirth: "1990-01-01", isFullDuration: true }],
  };

  it("accepts standard US phone", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "7372021887" }).success).toBe(true);
  });

  it("accepts phone with dashes", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "737-202-1887" }).success).toBe(true);
  });

  it("accepts phone with country code", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "+1 737 202 1887" }).success).toBe(true);
  });

  it("accepts phone with parens", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "(737) 202-1887" }).success).toBe(true);
  });

  it("rejects phone with letters", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "737-ABC-1887" }).success).toBe(false);
  });

  it("rejects phone shorter than 7 chars", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("rejects phone longer than 20 chars", () => {
    expect(groupRegistrationSchema.safeParse({ ...base, phone: "1".repeat(21) }).success).toBe(false);
  });
});

describe("groupRegistrantSchema — KOTE registrant with all fields", () => {
  it("accepts a fully-specified KOTE registrant", () => {
    const r = groupRegistrantSchema.safeParse({
      firstName: "Henok",
      lastName: "Robale",
      dateOfBirth: "1990-01-01",
      gender: "male",
      city: "Austin",
      churchId: "550e8400-e29b-41d4-a716-446655440000",
      isFullDuration: false,
      numDays: 2,
      selectedDays: [2, 3],
      attendanceType: "kote",
      mealServiceIds: ["550e8400-e29b-41d4-a716-446655440001"],
      tshirtSize: "L",
      serviceLanguage: "amharic",
      serviceAgeBand: "adults",
    });
    expect(r.success).toBe(true);
  });
});

describe("groupRegistrantSchema — gender validation", () => {
  const base = { firstName: "Jane", lastName: "Smith", dateOfBirth: "2010-05-15", isFullDuration: true };

  it("accepts male", () => {
    expect(groupRegistrantSchema.safeParse({ ...base, gender: "male" }).success).toBe(true);
  });

  it("accepts female", () => {
    expect(groupRegistrantSchema.safeParse({ ...base, gender: "female" }).success).toBe(true);
  });

  it("rejects invalid gender", () => {
    expect(groupRegistrantSchema.safeParse({ ...base, gender: "other" }).success).toBe(false);
  });

  it("accepts omitted gender", () => {
    expect(groupRegistrantSchema.safeParse(base).success).toBe(true);
  });
});
