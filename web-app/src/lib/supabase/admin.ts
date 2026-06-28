// SERVER-ONLY Supabase admin client (service role key).
//
// The `server-only` import makes the build FAIL if this module is ever imported
// into client/browser code — the service role key must never reach the browser.
// Use ONLY inside Server Actions / Route Handlers for privileged operations that
// RLS intentionally forbids to normal users (child provisioning, password resets,
// login lockout bookkeeping). RLS is bypassed by this client, so every caller must
// enforce its own authorization checks first.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isServiceRoleConfigured =
  supabaseUrl.length > 0 && serviceRoleKey.length > 0;

let cached: SupabaseClient | null = null;

/**
 * Returns a singleton service-role client. Throws a clear error if the service
 * role key (or URL) is not configured, so server actions surface a precise
 * "not configured" message instead of failing obscurely.
 */
export function getAdminClient(): SupabaseClient {
  if (!isServiceRoleConfigured) {
    throw new Error(
      "Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY " +
        "(server-only) and NEXT_PUBLIC_SUPABASE_URL in the server environment.",
    );
  }
  if (!cached) {
    cached = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
