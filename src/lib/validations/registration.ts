import { z } from "zod";

export const personalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
});

export const attendanceSchema = z.discriminatedUnion("isFullDuration", [
  z.object({
    isFullDuration: z.literal(true),
    isStayingInMotel: z.boolean(),
    numDays: z.undefined().optional(),
  }),
  z.object({
    isFullDuration: z.literal(false),
    isStayingInMotel: z.undefined().optional(),
    numDays: z.number().int().min(1, "At least 1 day required"),
  }),
]);

export const registrationSchema = personalInfoSchema.merge(
  z.object({
    eventId: z.string().uuid("Invalid event ID"),
    isFullDuration: z.boolean(),
    isStayingInMotel: z.boolean().optional(),
    numDays: z.number().int().min(1).optional(),
  })
);

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>;
export type AttendanceValues = z.infer<typeof attendanceSchema>;
export type RegistrationValues = z.infer<typeof registrationSchema>;

export const eventSchema = z.object({
  name: z.string().min(1, "Event name is required").max(200),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  adultAgeThreshold: z.number().int().min(1).max(100).default(18),
  youthAgeThreshold: z.number().int().min(1).max(100).default(13),
});

export const pricingSchema = z.object({
  adultFullPrice: z.number().min(0),
  adultDailyPrice: z.number().min(0),
  youthFullPrice: z.number().min(0),
  youthDailyPrice: z.number().min(0),
  childFullPrice: z.number().min(0),
  childDailyPrice: z.number().min(0),
  motelStayFree: z.boolean().default(true),
});
