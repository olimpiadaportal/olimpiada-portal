// Session + role state (zustand). Parent email login talks to Supabase
// directly; child login and registration go through the BFF (tokens in, then
// supabase.auth.setSession). Roles are resolved SERVER-side via the has_role
// RPC — the client never trusts a locally-stored role claim.
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { bffChildLogin, bffRegisterParent, type SessionTokens } from "@/lib/api";
import { clearPendingLink } from "@/lib/deeplink";
import { deregisterPushToken } from "@/features/push/registration";

export type SessionRole = "parent" | "student" | "unknown";
export type AuthStatus = "restoring" | "signedOut" | "signedIn";

type AuthState = {
  status: AuthStatus;
  role: SessionRole | null;
  userId: string | null;
  /** public.profiles.id for the signed-in user (Realtime filters, RPC args). */
  profileId: string | null;
  restore: () => Promise<void>;
  resolveRole: () => Promise<SessionRole>;
  parentLogin: (email: string, password: string) => Promise<{ error?: string }>;
  childLogin: (childId: string, password: string) => Promise<{ error?: string }>;
  registerParent: (fields: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone: string;
  }) => Promise<{ error?: string; verifyEmail?: boolean }>;
  signOut: () => Promise<void>;
};

async function serverProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("current_profile_id");
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

async function serverRole(): Promise<SessionRole> {
  try {
    const parent = await supabase.rpc("has_role", { p_role_code: "parent" });
    if (parent.data === true) return "parent";
    const student = await supabase.rpc("has_role", { p_role_code: "student" });
    if (student.data === true) return "student";
    // Network/RLS hiccup vs genuinely role-less both land here; the boot gate
    // shows a retry + logout escape for "unknown".
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function adoptTokens(tokens: SessionTokens): Promise<boolean> {
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return !error;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "restoring",
  role: null,
  userId: null,
  profileId: null,

  restore: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        set({ status: "signedOut", role: null, userId: null, profileId: null });
        return;
      }
      const [role, profileId] = await Promise.all([serverRole(), serverProfileId()]);
      set({ status: "signedIn", role, userId: data.session.user.id, profileId });
    } catch {
      set({ status: "signedOut", role: null, userId: null, profileId: null });
    }
  },

  resolveRole: async () => {
    const role = await serverRole();
    set({ role });
    return role;
  },

  parentLogin: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.session) {
      if (error && /confirm/i.test(error.message)) {
        return { error: "parent.err.unverified" };
      }
      return { error: "parent.err.invalid" };
    }
    const [role, profileId] = await Promise.all([serverRole(), serverProfileId()]);
    set({ status: "signedIn", role, userId: data.session.user.id, profileId });
    return {};
  },

  childLogin: async (childId, password) => {
    const res = await bffChildLogin(childId, password);
    if (!res.ok) return { error: res.error };
    if (!(await adoptTokens(res.data))) {
      return { error: "auth.child.err.serverError" };
    }
    const [role, profileId] = await Promise.all([serverRole(), serverProfileId()]);
    set({ status: "signedIn", role, userId: res.data.user_id, profileId });
    return {};
  },

  registerParent: async (fields) => {
    const res = await bffRegisterParent({
      first_name: fields.firstName,
      last_name: fields.lastName,
      email: fields.email,
      password: fields.password,
      phone: fields.phone,
    });
    if (!res.ok) return { error: res.error };
    if ("verify_email" in res.data) return { verifyEmail: true };
    if (!(await adoptTokens(res.data))) {
      return { error: "parent.err.createFailed" };
    }
    const [role, profileId] = await Promise.all([serverRole(), serverProfileId()]);
    set({ status: "signedIn", role, userId: res.data.user_id, profileId });
    return {};
  },

  signOut: async () => {
    try {
      // De-register push BEFORE the session dies: the push_tokens DELETE is
      // an own-row RLS policy and needs the still-valid JWT. Best-effort —
      // logout never blocks on it (also clears the stored token + badge).
      await deregisterPushToken();
    } catch {
      // orphaned tokens are invalidated server-side on DeviceNotRegistered
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // local state is cleared regardless
    }
    clearPendingLink();
    queryClient.clear();
    set({ status: "signedOut", role: null, userId: null, profileId: null });
  },
}));

// A hard sign-out elsewhere (token revoked, refresh failed) must flip the
// store too, or the router would keep the user inside a role group.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    const s = useAuthStore.getState();
    if (s.status === "signedIn") {
      useAuthStore.setState({ status: "signedOut", role: null, userId: null, profileId: null });
    }
  }
});
