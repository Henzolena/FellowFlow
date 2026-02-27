import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminRole = "admin" | "super_admin";

type AuthResult =
  | { authorized: true; userId: string; role: AdminRole }
  | { authorized: false; response: NextResponse };

/**
 * Verify the current request is from an authenticated admin or super_admin.
 * Use in every /api/admin/* route handler as the first check.
 *
 * Usage:
 *   const auth = await requireAdmin();
 *   if (!auth.authorized) return auth.response;
 *   // auth.userId and auth.role are now available
 */
export async function requireAdmin(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    role: profile.role as AdminRole,
  };
}

/**
 * Stricter guard: require super_admin role.
 */
export async function requireSuperAdmin(): Promise<AuthResult> {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth;

  if (auth.role !== "super_admin") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Only super admins can perform this action" },
        { status: 403 }
      ),
    };
  }

  return auth;
}
