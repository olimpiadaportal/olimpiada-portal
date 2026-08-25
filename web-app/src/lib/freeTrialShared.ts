// Free Trial pieces that BOTH the server and the browser need.
//
// Deliberately free of `import "server-only"` and of any Supabase import: the
// countdown and the picker are client components, and pulling them through the
// server-only module would fail the build (it did, once). The server-side reads
// live in `lib/freeTrial.ts`, which re-exports these so server callers have a
// single import site.
//
// Nothing in here touches the clock or the network — it is all pure, which is
// also what makes it testable without fake timers.

/**
 * The cap, in the one place the UI reads it. Mirrored by `ck_free_trial_subjects`
 * on the table and by a guard inside `activate_free_trial`, because a client
 * constant is bypassable by a hand-crafted POST — the same reasoning as
 * planBasket.validatePlanItems, which REJECTS an over-cap basket rather than
 * truncating it.
 *
 * Deliberately NOT `MAX_CONFIGURATOR_SUBJECTS`, which governs paid baskets.
 */
export const TRIAL_MAX_SUBJECTS = 2;

export type TrialSubject = { id: string; code: string; name: string };

export type FreeTrialState = {
  /** A trial exists AND has not expired. */
  active: boolean;
  /** A trial row exists at all — true even once it has expired. Once only. */
  used: boolean;
  endsAt: string | null;
  subjects: TrialSubject[];
};

export const NO_TRIAL: FreeTrialState = {
  active: false,
  used: false,
  endsAt: null,
  subjects: [],
};

/**
 * Split a millisecond remainder into whole h/m/s. Clamps at zero: a negative
 * remainder is an expired trial, never a negative badge.
 */
export function splitRemaining(ms: number): { h: number; m: number; s: number; done: boolean } {
  if (!Number.isFinite(ms) || ms <= 0) return { h: 0, m: 0, s: 0, done: true };
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    done: false,
  };
}

/** Shape-check whatever the RPC returned, failing closed to "no trial". */
export function parseFreeTrial(data: unknown): FreeTrialState {
  if (!data || typeof data !== "object") return NO_TRIAL;
  const d = data as {
    active?: boolean;
    used?: boolean;
    ends_at?: string | null;
    subjects?: unknown;
  };
  const subjects: TrialSubject[] = Array.isArray(d.subjects)
    ? (d.subjects as Record<string, unknown>[])
        .map((s) => ({
          id: typeof s.id === "string" ? s.id : "",
          code: typeof s.code === "string" ? s.code : "",
          name: typeof s.name === "string" ? s.name : "",
        }))
        .filter((s) => s.id !== "")
    : [];
  return {
    active: d.active === true,
    used: d.used === true,
    endsAt: typeof d.ends_at === "string" ? d.ends_at : null,
    subjects,
  };
}
