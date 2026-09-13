import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import {
  CHILD_LINK_ACTIONS,
  CHILD_LINK_ERROR_KEYS,
  type ChildLinkMutationInput,
  type ChildLinkMutationResult,
  type ChildLinkState,
} from "@/lib/childLink";

const CHILD_ID_RE = /^\d{8}$/;
const CODE_RE = /^[A-F0-9]{20}$/;

function failure(code: unknown): ChildLinkMutationResult {
  const key = typeof code === "string" ? CHILD_LINK_ERROR_KEYS[code] : undefined;
  return { ok: false, errorKey: key ?? "link.err.generic" };
}

export async function getChildLinkState(
  actorProfileId: string,
  studentId?: string,
): Promise<ChildLinkState> {
  if (!isUuid(actorProfileId) || (studentId !== undefined && !isUuid(studentId))) {
    return { children: [], pending: [] };
  }
  const { data, error } = await getAdminClient().rpc("parent_link_state", {
    p_actor: actorProfileId,
    p_student: studentId ?? null,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("child_link_state_failed");
  }
  const raw = data as Record<string, unknown>;
  return {
    children: Array.isArray(raw.children) ? (raw.children as ChildLinkState["children"]) : [],
    pending: Array.isArray(raw.pending) ? (raw.pending as ChildLinkState["pending"]) : [],
  };
}

export async function mutateChildLink(
  actorProfileId: string,
  input: ChildLinkMutationInput,
): Promise<ChildLinkMutationResult> {
  if (!isUuid(actorProfileId) || !CHILD_LINK_ACTIONS.includes(input.action)) {
    return failure("invalid");
  }
  if (input.studentId && !isUuid(input.studentId)) return failure("invalid");
  if (input.invitationId && !isUuid(input.invitationId)) return failure("invalid");
  if (input.parentId && !isUuid(input.parentId)) return failure("invalid");

  const childId = input.childId?.replace(/\s/g, "") ?? "";
  const code = input.code?.replace(/[\s-]/g, "").toUpperCase() ?? "";
  if (input.action === "redeem" && (!CHILD_ID_RE.test(childId) || !CODE_RE.test(code))) {
    return failure("invalidInvite");
  }

  const { data, error } = await getAdminClient().rpc("manage_child_link", {
    p_actor: actorProfileId,
    p_action: input.action,
    p_student: input.studentId ?? null,
    p_invite: input.invitationId ?? null,
    p_parent: input.parentId ?? null,
    p_child_id: childId || null,
    p_code: code || null,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errorKey: "link.err.generic" };
  }
  const raw = data as Record<string, unknown>;
  if (raw.ok !== true) return failure(raw.code);
  if (input.action === "issue") {
    if (typeof raw.code !== "string" || typeof raw.expires_at !== "string" || typeof raw.child_id !== "string") {
      return { ok: false, errorKey: "link.err.generic" };
    }
    return { ok: true, code: raw.code, expiresAt: raw.expires_at, childId: raw.child_id };
  }
  return { ok: true, state: raw.state === "pending" ? "pending" : "saved" };
}
