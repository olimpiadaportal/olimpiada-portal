export const CHILD_LINK_ACTIONS = [
  "issue",
  "redeem",
  "approve",
  "reject",
  "revokeInvite",
  "revoke",
  "leave",
] as const;

export type ChildLinkAction = (typeof CHILD_LINK_ACTIONS)[number];

export type ChildLinkInvitation = {
  id: string;
  status: "open" | "pending";
  expires_at: string;
  name?: string | null;
  masked_email?: string | null;
};

export type ChildLinkAdult = { parent_id: string; name: string | null };

export type ChildLinkChild = {
  id: string;
  name: string;
  child_id: string | null;
  is_creator: boolean;
  creator_name: string | null;
  adults: ChildLinkAdult[];
  invitations: ChildLinkInvitation[];
};

export type ChildLinkState = {
  children: ChildLinkChild[];
  pending: { id: string; expires_at: string }[];
};

export type ChildLinkMutationInput = {
  action: ChildLinkAction;
  studentId?: string;
  invitationId?: string;
  parentId?: string;
  childId?: string;
  code?: string;
};

export type ChildLinkMutationResult =
  | { ok: true; state: "pending" | "saved" }
  | { ok: true; code: string; expiresAt: string; childId: string }
  | { ok: false; errorKey: string };

export const CHILD_LINK_ERROR_KEYS: Record<string, string> = {
  forbidden: "link.err.forbidden",
  invalid: "link.err.invalid",
  invalidInvite: "link.err.invalidInvite",
  alreadyLinked: "link.err.alreadyLinked",
  unavailable: "link.err.unavailable",
  creatorOnly: "link.err.creatorOnly",
  limit: "link.err.limit",
  needsId: "link.err.needsId",
  rate: "link.err.rate",
};
