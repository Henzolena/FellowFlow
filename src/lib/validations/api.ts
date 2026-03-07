import { z } from "zod";

const uuid = z.string().uuid();

// ─── Payment ───

export const createSessionSchema = z
  .object({
    registrationId: uuid.optional(),
    groupId: uuid.optional(),
  })
  .refine((d) => d.registrationId || d.groupId, {
    message: "Registration ID or Group ID required",
  });

// ─── Pricing quote (solo) ───

export const quoteSchema = z.object({
  eventId: uuid,
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  isFullDuration: z.boolean(),
  isStayingInMotel: z.boolean().optional(),
  numDays: z.number().int().min(1).optional(),
});

// ─── Duplicate check ───

export const checkDuplicateSchema = z.object({
  email: z.string().email("Valid email is required"),
  eventId: uuid,
});

// ─── Resend confirmation ───

export const resendConfirmationSchema = z.object({
  registrationId: uuid,
  email: z.string().email("Valid email is required"),
});

// ─── Send receipt / verify receipt ───

export const receiptLookupSchema = z.object({
  confirmationId: z.string().min(1, "Confirmation ID is required"),
  lastName: z.string().min(1, "Last name is required"),
});

// ─── Admin: create/update event ───

export const adminCreateEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  adultAgeThreshold: z.number().int().min(1).max(100).default(18),
  youthAgeThreshold: z.number().int().min(1).max(100).default(13),
  pricing: z
    .object({
      adultFullPrice: z.number().min(0).default(0),
      adultDailyPrice: z.number().min(0).default(0),
      youthFullPrice: z.number().min(0).default(0),
      youthDailyPrice: z.number().min(0).default(0),
      childFullPrice: z.number().min(0).default(0),
      childDailyPrice: z.number().min(0).default(0),
      motelStayFree: z.boolean().default(true),
      koteDailyPrice: z.number().min(0).default(10),
      lodgingFee: z.number().min(0).default(0),
    })
    .optional(),
});

export const adminUpdateEventSchema = adminCreateEventSchema.extend({
  id: uuid,
  isActive: z.boolean().default(true),
});

// ─── Admin: create admin user ───

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "super_admin"]).default("admin"),
});

// ─── Admin: update admin user ───

export const adminUpdateUserSchema = z.object({
  role: z.enum(["user", "admin", "super_admin"]).optional(),
  fullName: z.string().optional(),
  phone: z.string().optional(),
});
