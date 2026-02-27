import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can modify admin roles
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admins can modify admin roles" },
        { status: 403 }
      );
    }

    // Cannot modify own role
    if (id === user.id) {
      return NextResponse.json(
        { error: "Cannot modify your own role" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { role, fullName, phone } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (role && ["user", "admin", "super_admin"].includes(role)) {
      updates.role = role;
    }
    if (fullName !== undefined) updates.full_name = fullName;
    if (phone !== undefined) updates.phone = phone || null;

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ message: "Admin updated successfully" });
  } catch (error) {
    console.error("Update admin error:", error);
    return NextResponse.json(
      { error: "Failed to update admin" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can remove admins
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admins can remove admins" },
        { status: 403 }
      );
    }

    // Cannot remove yourself
    if (id === user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 }
      );
    }

    // Demote to regular user instead of deleting
    const { error } = await supabase
      .from("profiles")
      .update({
        role: "user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ message: "Admin access revoked" });
  } catch (error) {
    console.error("Remove admin error:", error);
    return NextResponse.json(
      { error: "Failed to remove admin" },
      { status: 500 }
    );
  }
}
