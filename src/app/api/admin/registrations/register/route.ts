import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";
import { generateEntitlements } from "@/lib/services/entitlement-generator";
import { autoAssignBed } from "@/lib/services/bed-auto-assign";
import { sendConfirmationEmail } from "@/lib/email/resend";
import { createLogger } from "@/lib/logger";
import {
  getRepresentativeAge,
  getCategory,
  syntheticDob,
  CANONICAL_BAND_KEYS,
} from "@/lib/registration/age-bands";

const registerSchema = z.object({
  eventId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  ageRange: z.enum(["infant", "child", "youth", "adult"]),
  dateOfBirth: z.string().optional(),
  city: z.string().optional(),
  churchId: z.string().uuid().optional(),
  churchNameCustom: z.string().optional(),
  attendanceType: z.enum(["full_conference", "partial", "kote"]).default("full_conference"),
  selectedDays: z.array(z.number().int().min(1).max(10)).optional(),
  isStayingInMotel: z.boolean().default(false),
  bedId: z.string().uuid().optional(),
  notes: z.string().optional(),
  sendEmail: z.boolean().default(true),
  tshirtSize: z.enum(["XS", "S", "M", "L", "XL", "2XL", "3XL"]).optional().nullable(),
  serviceLanguage: z.enum(["amharic", "english"]).optional().nullable(),
  serviceAgeBand: z.string().max(20).optional().nullable(),
  gradeLevel: z.enum(["7th-8th", "9th-10th", "11th", "12th", "college_career"]).optional().nullable(),
});


// POST /api/admin/registrations/register — unified admin registration (auto-confirmed, payment waived)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const supabase = await createClient();

    // Fetch admin profile
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", auth.userId)
      .single();
    const adminIdentity = adminProfile?.full_name || adminProfile?.email || auth.userId;

    // Fetch event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", v.eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Map canonical ageRange to category and representative age.
    const eventThresholds = {
      infant: event.infant_age_threshold ?? 3,
      youth: event.youth_age_threshold ?? 13,
      adult: event.adult_age_threshold ?? 18,
    };
    const category = getCategory(v.ageRange, eventThresholds);
    const ageAtEvent = getRepresentativeAge(v.ageRange, eventThresholds);
    const dateOfBirth = v.dateOfBirth || syntheticDob(ageAtEvent, event.start_date);

    // Determine attendance details
    const isFullDuration = v.attendanceType === "full_conference";
    const numDays = isFullDuration ? null : (v.selectedDays?.length ?? 1);
    const selectedDays = isFullDuration ? null : (v.selectedDays ?? null);

    // Determine access tier
    let accessTier = "FULL_ACCESS";
    if (v.attendanceType === "kote") accessTier = "KOTE_ACCESS";

    // Compute explanation code based on age range and attendance type
    let explanationCode: string;
    if (v.ageRange === "infant") {
      explanationCode = "FREE_INFANT";
    } else if (v.attendanceType === "kote") {
      explanationCode = "KOTE";
    } else if (v.attendanceType === "partial") {
      explanationCode = category === "youth" ? "PARTIAL_YOUTH" : category === "child" ? "PARTIAL_CHILD" : "PARTIAL_ADULT";
    } else {
      explanationCode = category === "youth" ? "FULL_YOUTH" : category === "child" ? "FULL_CHILD" : "FULL_ADULT";
    }

    // Generate public confirmation code
    const { data: codeResult } = await supabase.rpc("generate_confirmation_code", {
      p_first_name: v.firstName,
      p_last_name: v.lastName,
      p_event_id: v.eventId,
    });
    const initials = (v.firstName.charAt(0) + v.lastName.charAt(0)).toUpperCase();
    const publicCode = codeResult || `MW26-${initials}-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;

    // Resolve church name for email
    let churchName: string | null = null;
    if (v.churchId) {
      const { data: church } = await supabase.from("churches").select("name").eq("id", v.churchId).single();
      churchName = church?.name || null;
    } else if (v.churchNameCustom) {
      churchName = v.churchNameCustom;
    }

    const now = new Date().toISOString();

    // Validate bed assignment if requested (respect max_occupants)
    if (v.bedId) {
      const { data: bed } = await supabase
        .from("beds")
        .select("max_occupants")
        .eq("id", v.bedId)
        .single();

      const { count: currentCount } = await supabase
        .from("lodging_assignments")
        .select("*", { count: "exact", head: true })
        .eq("bed_id", v.bedId);

      if (bed && (currentCount ?? 0) >= bed.max_occupants) {
        return NextResponse.json({ error: "Selected bed is at full capacity" }, { status: 409 });
      }
    }

    // Create registration
    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .insert({
        event_id: v.eventId,
        first_name: v.firstName,
        last_name: v.lastName,
        email: v.email,
        phone: v.phone || null,
        date_of_birth: dateOfBirth,
        age_at_event: ageAtEvent,
        category,
        is_full_duration: isFullDuration,
        attendance_type: v.attendanceType,
        num_days: numDays,
        selected_days: selectedDays,
        is_staying_in_motel: v.isStayingInMotel,
        computed_amount: 0,
        explanation_code: explanationCode,
        explanation_detail: "Complimentary — registered by admin",
        status: "confirmed",
        confirmed_at: now,
        gender: v.gender || null,
        city: v.city || null,
        church_id: v.churchId || null,
        church_name_custom: v.churchNameCustom || null,
        public_confirmation_code: publicCode,
        access_tier: accessTier,
        registration_source: "admin_direct",
        payment_waived: true,
        admin_notes: v.notes || null,
        invited_by_admin: adminIdentity,
        tshirt_size: v.tshirtSize || null,
        service_language: v.serviceLanguage || null,
        service_age_band: v.serviceAgeBand || null,
        grade_level: v.gradeLevel || null,
      })
      .select()
      .single();

    if (regError) {
      if (regError.code === "23505") {
        return NextResponse.json(
          { error: "This person already has an active registration for this event. Check existing registrations." },
          { status: 409 }
        );
      }
      throw regError;
    }

    // Assign bed: manual selection or auto-assign by city
    let lodgingAssigned = false;
    let autoAssignedInfo: { motelName: string; bedLabel: string } | null = null;
    if (v.bedId) {
      // Early validation (above) already confirmed capacity — fetch info and insert
      const { data: bedInfo } = await supabase
        .from("beds")
        .select("bed_label, max_occupants, rooms(room_number, motels(name))")
        .eq("id", v.bedId)
        .single();

      const { error: lodgingError } = await supabase
        .from("lodging_assignments")
        .insert({
          registration_id: registration.id,
          bed_id: v.bedId,
          check_in_date: event.start_date,
          check_out_date: event.end_date,
          assigned_by: auth.userId,
          notes: v.notes ? `Admin registration: ${v.notes}` : "Assigned during admin registration",
        });

      if (!lodgingError) {
        if (bedInfo) {
          const rm = bedInfo.rooms as unknown as { room_number: string; motels: { name: string } } | null;
          autoAssignedInfo = { motelName: rm?.motels?.name || "Unknown", bedLabel: bedInfo.bed_label };
        }
        // Mark occupied only if now at capacity
        const { count: newCount } = await supabase
          .from("lodging_assignments")
          .select("*", { count: "exact", head: true })
          .eq("bed_id", v.bedId);
        if (bedInfo && (newCount ?? 0) >= bedInfo.max_occupants) {
          await supabase.from("beds").update({ is_occupied: true }).eq("id", v.bedId);
        }
        lodgingAssigned = true;
      } else {
        console.error("Lodging assignment failed (non-fatal):", lodgingError);
      }
    } else if (v.attendanceType !== "kote") {
      // Auto-assign based on city→dorm mapping (skip for KOTE — off-campus)
      let city = v.city || null;
      if (!city && v.churchId) {
        const { data: church } = await supabase.from("churches").select("city").eq("id", v.churchId).single();
        city = church?.city ?? null;
      }
      if (city) {
        try {
          const result = await autoAssignBed(supabase, {
            registrationId: registration.id,
            eventId: v.eventId,
            city,
            gender: v.gender ?? null,
            assignedBy: auth.userId,
            checkInDate: event.start_date,
            checkOutDate: event.end_date,
          });
          if (result) {
            lodgingAssigned = true;
            autoAssignedInfo = { motelName: result.motelName, bedLabel: result.bedLabel };
          }
        } catch (e) {
          console.error("Bed auto-assignment failed (non-fatal):", e);
        }
      }
    }

    // Generate entitlements
    const log = createLogger("admin-register");
    try {
      await generateEntitlements(supabase, registration.id, v.eventId, log);
    } catch (entErr) {
      console.error("Entitlement generation failed (non-fatal):", entErr);
    }

    // Send confirmation email
    let emailSent = false;
    if (v.sendEmail) {
      try {
        await sendConfirmationEmail({
          to: v.email,
          firstName: v.firstName,
          lastName: v.lastName,
          eventName: event.name,
          eventStartDate: event.start_date,
          eventEndDate: event.end_date,
          amount: 0,
          isFree: true,
          registrationId: registration.id,
          confirmationCode: publicCode,
          secureToken: registration.secure_token,
          explanationDetail: "Complimentary — registered by admin",
          attendanceType: v.attendanceType,
          category,
          accessTier,
          gender: v.gender,
          city: v.city,
          churchName,
          selectedDays: selectedDays ?? undefined,
          dormName: autoAssignedInfo?.motelName ?? null,
          bedLabel: autoAssignedInfo?.bedLabel ?? null,
          tshirtSize: v.tshirtSize ?? null,
        });
        emailSent = true;
      } catch (emailErr) {
        console.error("Confirmation email failed (non-fatal):", emailErr);
      }
    }

    return NextResponse.json({
      registration,
      emailSent,
      lodgingAssigned,
      autoAssignedInfo,
    }, { status: 201 });
  } catch (error) {
    console.error("Admin register error:", error);
    return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
  }
}
