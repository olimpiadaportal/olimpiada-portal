// The typed confirmation token, checked once BEFORE the destructive RPC.
//
// The DATABASE is still the control, not this file: every guarded-deletion
// function in migration 111 re-compares p_expected_code against the row's own
// `code` inside the same FOR UPDATE transaction, which is the only place the
// comparison is atomic with the delete. Those RPCs are granted to
// `authenticated`, so a hand-crafted PostgREST POST bypasses this module
// entirely — and still fails there.
//
// This pre-check exists for a different reason: an empty or plainly wrong token
// must never become a destructive call at all. Sending it anyway would mean the
// mutation path (FOR UPDATE lock, scope read, purge) is entered on every
// mistyped confirmation, and the admin would get the mismatch message back from
// a round trip that had already touched the row it was about to destroy.
//
// Plain module (`server-only`, no "use server") so the action files may import
// it — a "use server" module can only export async functions.
import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Tables whose `code` column is a confirmation token. Never a client string. */
export type ConfirmableTable = "subjects" | "olympiad_packages";

/**
 * Does the typed token match the row's code?
 *
 *   true  — matches; proceed to the RPC (which compares again, under lock).
 *   false — empty or wrong; refuse here, before anything destructive runs.
 *   null  — the code could not be read (missing row, RLS, transport). NOT
 *           treated as a mismatch: reporting "wrong confirmation code" for a
 *           package that simply no longer exists sends the admin hunting for a
 *           typo that is not there. The caller falls through to the RPC, whose
 *           own no_data_found is the accurate answer.
 */
export async function confirmationTokenMatches(
  supabase: Db,
  table: ConfirmableTable,
  id: string,
  typed: string,
): Promise<boolean | null> {
  // Refused without a query: nothing was confirmed, so there is nothing to
  // compare and no reason to touch the database.
  if (typeof typed !== "string" || typed.trim() === "") return false;

  const { data, error } = await supabase
    .from(table)
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    console.error(
      "[admin] confirmation code lookup failed",
      table,
      (error as { code?: string } | null)?.code ?? "not_found",
    );
    return null;
  }
  const code = typeof (data as { code?: unknown }).code === "string"
    ? (data as { code: string }).code
    : "";
  // Exact comparison, never case-insensitive or trimmed on the stored side: the
  // DB compares with `<>`, and a token this layer accepted but the RPC rejected
  // would read as a random failure.
  return code !== "" && typed === code;
}
