// PUBLIC maintenance-status endpoint (owner item 12).
//
// The maintenance splash polls this every ~4s so visitors auto-exit the moment
// an admin turns maintenance off (the admin panel is a SEPARATE deployment, so
// cross-app revalidateTag is impossible — polling + the 4s server TTL in
// flags.ts is the propagation mechanism).
//
// Anon-safe by design: it returns ONLY the on/off flag and the trilingual
// notice text — both already shown to every visitor while maintenance is on.
// Reads the DB directly (service-role client server-side; no secrets, no
// caching) so the poller always sees the live value.
import { NextResponse } from "next/server";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { locales } from "@/i18n/config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const out: {
    enabled: boolean;
    message: Record<string, string>;
    updatedAt?: string;
  } = { enabled: false, message: {} };

  if (!isServiceRoleConfigured) {
    return NextResponse.json(out, { headers: NO_STORE });
  }

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value_json, updated_at")
      .in("key", ["platform.maintenance_mode", "platform.maintenance_message"]);
    if (!error && data) {
      for (const row of data as {
        key: string;
        value_json: unknown;
        updated_at: string | null;
      }[]) {
        if (row.key === "platform.maintenance_mode") {
          out.enabled = row.value_json === true;
          if (row.updated_at) out.updatedAt = row.updated_at;
        } else if (
          row.key === "platform.maintenance_message" &&
          row.value_json &&
          typeof row.value_json === "object"
        ) {
          const m = row.value_json as Record<string, unknown>;
          for (const l of locales) {
            const v = typeof m[l] === "string" ? (m[l] as string).trim() : "";
            if (v) out.message[l] = v;
          }
        }
      }
    }
  } catch {
    // Degrade to { enabled: false } — never leak an error body to the client.
  }

  return NextResponse.json(out, { headers: NO_STORE });
}
