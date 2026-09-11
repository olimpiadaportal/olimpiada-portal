// CROSS-ACCOUNT DATA MUST NOT SURVIVE A SESSION ENDING ON A SHARED DEVICE.
//
// THE BUG THIS PINS. `authStore.signOut()` — the Log out BUTTON — cleared the
// React Query cache AND the in-flight answer drafts, with a comment saying
// exactly why. The `onAuthStateChange("SIGNED_OUT")` handler right below it did
// NEITHER: it only flipped the store's status. That handler is the INVOLUNTARY
// exit — a revoked token, a refresh that failed — and on a family phone it is
// at least as common as the button. A parent's session expiring, followed by a
// child signing in on the same device, could therefore serve the previous
// account's data plus that account's half-finished test.
//
// Three constructions answer it, and all three are pinned here:
//
//   1. ONE teardown function, called by both paths (sessionTeardown.ts). The
//      drift between two hand-written copies WAS the defect, so the tests
//      assert against the shared function rather than re-listing what it does —
//      a duplicated list in a test rots exactly the way the code did.
//   2. A sign-IN resets too: a session can end with no teardown at all (the OS
//      kills the app), and whatever is left is addressable by whoever signs in
//      next.
//   3. Account-scoped query keys (accountScope.ts), so a stale entry is
//      UNREACHABLE from another profile even if a teardown were missed
//      entirely — and so the sign-in reset can select entries by a property of
//      the key instead of by a list that goes stale.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Self-contained factories only: a jest.mock factory is hoisted above every
// import in this file, so it must not close over anything declared here.
jest.mock("@/lib/supabase", () => {
  const listeners: ((event: string) => void)[] = [];
  return {
    __listeners: listeners,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        setSession: async () => ({ error: null }),
        signInWithPassword: async () => ({
          data: { session: { user: { id: "auth-user" } } },
          error: null,
        }),
        // Deliberately does NOT fire the listener: the two teardown paths are
        // driven separately below so each one's own behaviour stays visible.
        signOut: async () => ({ error: null }),
        onAuthStateChange: (cb: (event: string) => void) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
      },
      rpc: async (name: string) =>
        name === "current_profile_id" ? { data: "profile-2" } : { data: true },
    },
  };
});
jest.mock("@/lib/api", () => ({
  bffChildLogin: async () => ({
    ok: true,
    data: { access_token: "a", refresh_token: "r", user_id: "child-user" },
  }),
  bffRegisterParent: async () => ({
    ok: true,
    data: { access_token: "a", refresh_token: "r", user_id: "parent-user" },
  }),
  bffHealParentAccount: async () => ({ ok: true, healed: false }),
}));
jest.mock("@/features/push/registration", () => ({
  deregisterPushToken: async () => {},
}));

// WRAPPED, not replaced: the real implementations still run (so the effects
// asserted below are the real ones) while the wrapper records WHICH function
// each path called. That is what makes "both paths call the same function"
// assertable without writing a second copy of what the function does.
jest.mock("@/features/auth/sessionTeardown", () => {
  const actual = jest.requireActual("@/features/auth/sessionTeardown");
  return {
    clearAccountState: jest.fn(actual.clearAccountState),
    resetAccountStateForSignIn: jest.fn(actual.resetAccountStateForSignIn),
  };
});

import { useAuthStore } from "@/features/auth/authStore";
import {
  ACCOUNT_SCOPE,
  accountScoped,
  isAccountScopedKey,
} from "@/features/auth/accountScope";
import { clearAllDrafts, draftCount, ensureDraft } from "@/features/tests/draft";
import type { AttemptDraft } from "@/features/tests/draft";
import { consumePendingLink, storePendingLink } from "@/lib/deeplink";
import { queryClient } from "@/lib/queryClient";

const teardown = jest.requireMock("@/features/auth/sessionTeardown") as {
  clearAccountState: jest.Mock;
  resetAccountStateForSignIn: jest.Mock;
};
const signedOutListeners = (
  jest.requireMock("@/lib/supabase") as { __listeners: ((event: string) => void)[] }
).__listeners;

const CHILD_KEY = accountScoped(["arena", "self"] as const, "child-1");
const PARENT_KEY = accountScoped(["parent", "children"] as const, "parent-1");
const PUBLIC_KEY = ["mobile-config"] as const;

const newDraft = (): AttemptDraft => ({
  answers: { q1: null },
  flags: new Set<string>(),
  dirty: new Set<string>(),
  spentMs: new Map<string, number>(),
});

/** Everything a signed-in session leaves lying around, in one place. */
function seedSessionState(): void {
  queryClient.setQueryData(CHILD_KEY, { firstName: "Aysel" });
  queryClient.setQueryData(PARENT_KEY, [{ profile_id: "child-1" }]);
  queryClient.setQueryData(PUBLIC_KEY, { flags: {} });
  const draft = ensureDraft("attempt-1", newDraft);
  draft.answers.q1 = "option-b";
  draft.dirty.add("q1");
  storePendingLink("/child/leaderboard", "student");
}

beforeEach(() => {
  queryClient.clear();
  clearAllDrafts();
  consumePendingLink("student");
  consumePendingLink("parent");
  teardown.clearAccountState.mockClear();
  teardown.resetAccountStateForSignIn.mockClear();
  useAuthStore.setState({ status: "signedOut", role: null, userId: null, profileId: null });
});

afterAll(() => {
  queryClient.clear();
  clearAllDrafts();
});

describe("clearAccountState — the one teardown", () => {
  it("drops the query cache, the in-flight answer drafts and the pending link", () => {
    seedSessionState();
    teardown.clearAccountState();

    expect(queryClient.getQueryData(CHILD_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(PARENT_KEY)).toBeUndefined();
    // Blunt on the way out on purpose: nothing is worth keeping and no screen
    // is left to flicker, so it cannot depend on a key being classified right.
    expect(queryClient.getQueryData(PUBLIC_KEY)).toBeUndefined();
    // The half React Query cannot reach — drafts live in a module-level Map.
    expect(draftCount()).toBe(0);
    expect(consumePendingLink("student")).toBeNull();
  });
});

describe("resetAccountStateForSignIn — the incoming account starts clean", () => {
  it("drops every account-scoped entry and every draft", () => {
    seedSessionState();
    teardown.resetAccountStateForSignIn();

    expect(queryClient.getQueryData(CHILD_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(PARENT_KEY)).toBeUndefined();
    expect(draftCount()).toBe(0);
  });

  it("selects entries by the key marker, so a key added tomorrow is covered", () => {
    // Named nowhere in the implementation — it is dropped because it carries
    // the scope, not because it appears on a list.
    const brandNewKey = accountScoped(["some", "future", "read"] as const, "child-1");
    queryClient.setQueryData(brandNewKey, { anything: true });
    teardown.resetAccountStateForSignIn();
    expect(queryClient.getQueryData(brandNewKey)).toBeUndefined();
  });

  it("keeps the account-agnostic reads: RootGate gates the whole tree on them", () => {
    seedSessionState();
    teardown.resetAccountStateForSignIn();
    // Clearing the mobile config here would replace the login screen with the
    // splash for as long as the config RPC takes.
    expect(queryClient.getQueryData(PUBLIC_KEY)).toEqual({ flags: {} });
  });

  it("keeps the pending deep link, which is consumed right AFTER sign-in", () => {
    seedSessionState();
    teardown.resetAccountStateForSignIn();
    expect(consumePendingLink("student")).toBe("/(student)/(tabs)/ranking");
  });
});

describe("both ways out of a session run the same teardown", () => {
  it("the Log out button calls it", async () => {
    useAuthStore.setState({
      status: "signedIn",
      role: "parent",
      userId: "u1",
      profileId: "parent-1",
    });
    await useAuthStore.getState().signOut();

    expect(teardown.clearAccountState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().profileId).toBeNull();
  });

  it("the involuntary SIGNED_OUT (revoked token / failed refresh) calls it too", () => {
    expect(signedOutListeners.length).toBeGreaterThan(0);
    useAuthStore.setState({
      status: "signedIn",
      role: "student",
      userId: "u2",
      profileId: "child-1",
    });
    seedSessionState();

    for (const cb of signedOutListeners) cb("SIGNED_OUT");

    // THE SAME FUNCTION the button reached — asserted against the shared
    // reference, not against a re-listing of what it clears.
    expect(teardown.clearAccountState).toHaveBeenCalledTimes(signedOutListeners.length);
    expect(queryClient.getQueryData(CHILD_KEY)).toBeUndefined();
    expect(draftCount()).toBe(0);
    expect(useAuthStore.getState().status).toBe("signedOut");
  });

  it("does not tear down for a SIGNED_OUT that arrives while already signed out", () => {
    // supabase-js emits this at boot when a stored session turns out invalid,
    // and the store is still restoring/signed out then. Tearing down there
    // would wipe a cache no session ever owned.
    queryClient.setQueryData(PUBLIC_KEY, { flags: {} });
    for (const cb of signedOutListeners) cb("SIGNED_OUT");
    expect(teardown.clearAccountState).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(PUBLIC_KEY)).toEqual({ flags: {} });
  });

  it("ignores every other auth event", () => {
    useAuthStore.setState({
      status: "signedIn",
      role: "parent",
      userId: "u1",
      profileId: "parent-1",
    });
    for (const cb of signedOutListeners) cb("TOKEN_REFRESHED");
    expect(teardown.clearAccountState).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe("signedIn");
  });
});

describe("signing in starts from a clean cache", () => {
  it("child login resets before adopting the session", async () => {
    seedSessionState();
    await useAuthStore.getState().childLogin("12345678", "pw");

    expect(teardown.resetAccountStateForSignIn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(CHILD_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(PARENT_KEY)).toBeUndefined();
    expect(draftCount()).toBe(0);
    expect(useAuthStore.getState().status).toBe("signedIn");
  });

  it("parent login resets too", async () => {
    seedSessionState();
    await useAuthStore.getState().parentLogin("a@b.c", "pw");
    expect(teardown.resetAccountStateForSignIn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(PARENT_KEY)).toBeUndefined();
    expect(draftCount()).toBe(0);
  });

  it("registration resets too — the same store on the same device", async () => {
    seedSessionState();
    await useAuthStore.getState().registerParent({
      firstName: "A",
      lastName: "B",
      email: "a@b.c",
      password: "pw",
      phone: "",
    });
    expect(teardown.resetAccountStateForSignIn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(PARENT_KEY)).toBeUndefined();
  });

  it("does not swallow a deep link that arrived on the login screen", async () => {
    storePendingLink("/child/leaderboard", "student");
    await useAuthStore.getState().childLogin("12345678", "pw");
    expect(consumePendingLink("student")).toBe("/(student)/(tabs)/ranking");
  });
});

describe("the teardown is not re-implemented anywhere", () => {
  // If authStore can no longer NAME the primitives, it cannot fall out of step
  // with the shared function — which is the failure this whole round is about.
  const source = readFileSync(
    resolve(__dirname, "..", "src", "features", "auth", "authStore.ts"),
    "utf8",
  )
    // Comments blanked: prose ABOUT the teardown must neither satisfy nor fail
    // an assertion about the code.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");

  it.each(["queryClient", "clearAllDrafts", "clearPendingLink"])(
    "authStore never touches %s directly",
    (primitive) => {
      expect(source).not.toContain(primitive);
    },
  );

  it("reaches the teardown only through the shared functions", () => {
    expect(source).toContain("clearAccountState()");
    expect(source).toContain("resetAccountStateForSignIn()");
  });
});

describe("account scope", () => {
  it("marks a key and leaves it prefix-matchable", () => {
    const key = accountScoped(["arena", "streak"] as const, "child-1");
    expect(key).toEqual(["arena", "streak", ACCOUNT_SCOPE, "child-1"]);
    // The marker goes LAST so every existing prefix invalidation still matches.
    expect(key.slice(0, 2)).toEqual(["arena", "streak"]);
    expect(isAccountScopedKey(key)).toBe(true);
    expect(isAccountScopedKey(["mobile-config"])).toBe(false);
  });

  it("gives two accounts two different keys for the same read", () => {
    expect(accountScoped(["arena", "streak"] as const, "child-1")).not.toEqual(
      accountScoped(["arena", "streak"] as const, "child-2"),
    );
  });

  it("parks a signed-out read on its own scope, never on the last account's", () => {
    expect(accountScoped(["arena", "streak"] as const, null)).toEqual([
      "arena",
      "streak",
      ACCOUNT_SCOPE,
      "-",
    ]);
  });
});
