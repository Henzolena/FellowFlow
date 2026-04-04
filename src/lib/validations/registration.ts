import { z } from "zod";

export const attendanceTypeEnum = z.enum(["full_conference", "partial", "kote"]);
export const genderEnum = z.enum(["male", "female"]);
export const serviceLanguageEnum = z.enum(["amharic", "english"]);
export const gradeLevelEnum = z.enum(["7th-8th", "9th-10th", "11th", "12th", "college_career"]);

export const personalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
});

export const attendanceSchema = z.discriminatedUnion("isFullDuration", [
  z.object({
    isFullDuration: z.literal(true),
    isStayingInMotel: z.undefined().optional(),
    numDays: z.undefined().optional(),
  }),
  z.object({
    isFullDuration: z.literal(false),
    isStayingInMotel: z.boolean(),
    numDays: z.number().int().min(1).optional(),
  }),
]);

export const registrationSchema = personalInfoSchema.merge(
  z.object({
    eventId: z.string().uuid("Invalid event ID"),
    isFullDuration: z.boolean(),
    isStayingInMotel: z.boolean().optional(),
    numDays: z.number().int().min(1).optional(),
    selectedDays: z.array(z.number().int().min(1)).optional(),
    attendanceType: attendanceTypeEnum.optional(),
    gender: genderEnum.optional(),
    city: z.string().max(200).optional(),
    churchId: z.string().uuid().optional().nullable(),
    churchNameCustom: z.string().max(200).optional().nullable(),
    mealServiceIds: z.array(z.string().uuid()).optional(),
    tshirtSize: z.enum(["XS", "S", "M", "L", "XL", "2XL", "3XL"]).optional().nullable(),
    serviceLanguage: serviceLanguageEnum.optional().nullable(),
    serviceAgeBand: z.string().max(20).optional().nullable(),
    gradeLevel: gradeLevelEnum.optional().nullable(),
  })
);

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>;
export type AttendanceValues = z.infer<typeof attendanceSchema>;
export type RegistrationValues = z.infer<typeof registrationSchema>;

// Group registration: multiple registrants + shared contact info
export const groupRegistrantSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: genderEnum.optional(),
  city: z.string().max(200).optional(),
  churchId: z.string().uuid().optional().nullable(),
  churchNameCustom: z.string().max(200).optional().nullable(),
  isFullDuration: z.boolean(),
  isStayingInMotel: z.boolean().optional(),
  numDays: z.number().int().min(1).optional(),
  selectedDays: z.array(z.number().int().min(1)).optional(),
  attendanceType: attendanceTypeEnum.optional(),
  mealServiceIds: z.array(z.string().uuid()).optional(),
  tshirtSize: z.enum(["XS", "S", "M", "L", "XL", "2XL", "3XL"]).optional().nullable(),
  serviceLanguage: serviceLanguageEnum.optional().nullable(),
  serviceAgeBand: z.string().max(20).optional().nullable(),
  gradeLevel: gradeLevelEnum.optional().nullable(),
});

export const groupRegistrationSchema = z.object({
  eventId: z.string().uuid("Invalid event ID"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(7, "Phone number must be at least 7 characters").max(20, "Phone number is too long").regex(/^[\d\s()\-+.]+$/, "Please enter a valid phone number"),
  registrants: z.array(groupRegistrantSchema).min(1, "At least one registrant is required").max(20, "Maximum 20 registrants per group"),
});

export type GroupRegistrantValues = z.infer<typeof groupRegistrantSchema>;
export type GroupRegistrationValues = z.infer<typeof groupRegistrationSchema>;

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
  koteDailyPrice: z.number().min(0).default(10),
});
