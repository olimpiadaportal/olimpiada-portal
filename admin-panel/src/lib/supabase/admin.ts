import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SERVICE ROLE key. It bypasses RLS, so it
// must NEVER be imported into a Client Component or exposed to the browser. Only
// reachable through admin-guarded server actions.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function hasServiceRole(): boolean {
  return url.length > 0 && serviceKey.length > 0;
}

export function createAdminClient() {
  if (!hasServiceRole()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured (server-only).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
