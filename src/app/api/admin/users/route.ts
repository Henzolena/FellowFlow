import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins/super_admins can list admin users
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || !["admin", "super_admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: admins, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, role, created_at")
      .in("role", ["admin", "super_admin"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ admins, callerRole: callerProfile.role });
  } catch (error) {
    console.error("List admins error:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can create new admins
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admins can add new admins" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, fullName, phone, password, role } = body;

    if (!email || !fullName || !password) {
      return NextResponse.json(
        { error: "Email, full name, and password are required" },
        { status: 400 }
      );
    }

    const targetRole = role === "super_admin" ? "super_admin" : "admin";

    // Check if user already exists in profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", email)
      .single();

    if (existingProfile) {
      // User exists — just promote their role
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          role: targetRole,
          full_name: fullName,
          phone: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProfile.id);

      if (updateError) throw updateError;

      return NextResponse.json({
        message: `Existing user promoted to ${targetRole}`,
        id: existingProfile.id,
      });
    }

    // Use service role client to create users without affecting current session
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error: service role key required for user creation" },
        { status: 500 }
      );
    }

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      );
    }

    if (!newUser?.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    // Update the auto-created profile via service client (bypasses RLS)
    await adminClient
      .from("profiles")
      .update({
        role: targetRole,
        full_name: fullName,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", newUser.user.id);

    return NextResponse.json({
      message: `Admin ${fullName} created successfully`,
      id: newUser.user.id,
    });
  } catch (error) {
    console.error("Create admin error:", error);
    return NextResponse.json(
      { error: "Failed to create admin user" },
      { status: 500 }
    );
  }
}
