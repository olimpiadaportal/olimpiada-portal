// SERVER-ONLY. The adults who can reach a given child — the "who has access"
// list on /children/link and its mobile counterpart.
//
// THIS LIVED IN childCredentialLink.ts UNTIL 2026-09-17, AND THAT IS WHY IT IS
// HERE NOW. That module's job was linking a child by the CHILD's own password;
// the owner withdrew that route (migration 181) and the invite code is the only
// way in. This list was never about credentials — it is read by the invite panel
// and by nothing else — so leaving it in a file called "childCredentialLink"
// would have kept a credential-shaped module alive around it, which is how the
// removed flow gets rebuilt: the file name invites it back.
//
// The invite route itself lives in childLinkCore.ts (manage_child_link).
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";

export type ChildAccessAdult = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  role: "creator" | "linked";
  since: string | null;
};

/**
 * The adults who can reach this child, for the "who has access" panel.
 *
 * Readable only by an adult who already has access (creator or active link) -
 * the RPC enforces that, so this never becomes a way to discover the adults
 * around an arbitrary minor.
 */
export async function getChildAccessAdults(
  actorProfileId: string,
  studentProfileId: string,
): Promise<ChildAccessAdult[]> {
  if (!isUuid(actorProfileId) || !isUuid(studentProfileId)) return [];
  const { data, error } = await getAdminClient().rpc("child_access_adults", {
    p_actor: actorProfileId,
    p_student: studentProfileId,
  });
  if (error || !data || typeof data !== "object") return [];
  const row = data as Record<string, unknown>;
  if (row.ok !== true || !Array.isArray(row.adults)) return [];
  return row.adults as ChildAccessAdult[];
}
