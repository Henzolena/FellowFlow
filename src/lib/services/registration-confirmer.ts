import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@/lib/logger";

/**
 * Confirm a solo registration by updating its status to "confirmed".
 */
export async function confirmSoloRegistration(
  supabase: SupabaseClient,
  registrationId: string,
  log: Logger
): Promise<boolean> {
  const { error } = await supabase
    .from("registrations")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", registrationId)
    .eq("status", "pending");

  if (error) {
    log.error("Registration update failed", { registrationId, error: error.message });
    return false;
  }

  log.info("Solo registration confirmed", { registrationId });
  return true;
}

/**
 * Confirm all registrations in a group by updating their status to "confirmed".
 */
export async function confirmGroupRegistrations(
  supabase: SupabaseClient,
  groupId: string,
  log: Logger
): Promise<boolean> {
  const { error } = await supabase
    .from("registrations")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (error) {
    log.error("Group registration update failed", { groupId, error: error.message });
    return false;
  }

  return true;
}
