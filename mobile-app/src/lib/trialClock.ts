// The 24-hour free trial, as the app reads it (2026-10-10). Pure — no React,
// no network, no device clock of its own — so it is unit-testable and shared by
// the child's countdown, the add-child wizard and the parent's status pill.
//
// SERVER TIME, NOT DEVICE TIME. child_free_trial / my_free_trial return
// `server_now` from the same read as `ends_at` (migration 183). The countdown
// measures the device clock's skew against it ONCE, at the moment the answer
// arrived (`receivedAt`), and runs on `device now + skew`. A phone whose clock
// is minutes off — or set by hand — therefore shows the same remaining time as
// the web and the other platform, and cannot stretch or shorten the trial.
// (Access itself is decided by the database either way; this is only display.)

export type TrialSubject = { id: string; code: string | null; name: string };

export type TrialState = {
  /** A trial (or an extension of it) is running right now. */
  active: boolean;
  /** A trial exists at all — true once it has ended, too. Once per child. */
  used: boolean;
  /** When the current window ends (the later of the trial and any extension). */
  endsAt: string | null;
  /** The database's now() from the same read. */
  serverNow: string | null;
  /** Device time (ms) when this answer arrived — the skew is measured against it. */
  receivedAt: number;
  /** An administrator granted an extra window after the first one ended. */
  extended: boolean;
  subjects: TrialSubject[];
};

export const NO_TRIAL: TrialState = {
  active: false,
  used: false,
  endsAt: null,
  serverNow: null,
  receivedAt: 0,
  extended: false,
  subjects: [],
};

/** Shape-check the RPC payload, failing closed to "no trial". */
export function parseTrialState(data: unknown, receivedAt: number): TrialState {
  if (!data || typeof data !== "object") return { ...NO_TRIAL, receivedAt };
  const d = data as Record<string, unknown>;
  const subjects: TrialSubject[] = Array.isArray(d.subjects)
    ? (d.subjects as Record<string, unknown>[])
        .map((s) => ({
          id: typeof s?.id === "string" ? s.id : "",
          code: typeof s?.code === "string" ? s.code : null,
          name: typeof s?.name === "string" ? s.name : "",
        }))
        .filter((s) => s.id !== "")
    : [];
  return {
    active: d.active === true,
    used: d.used === true,
    endsAt: typeof d.ends_at === "string" ? d.ends_at : null,
    serverNow: typeof d.server_now === "string" ? d.server_now : null,
    receivedAt,
    extended: d.extended === true,
    subjects,
  };
}

/** Server-minus-device skew in ms; 0 when the server time is unknown. */
export function clockSkewMs(serverNow: string | null, receivedAt: number): number {
  if (!serverNow || !receivedAt) return 0;
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? server - receivedAt : 0;
}

/** Whole h/m/s left; clamps at zero (an expired trial, never a negative). */
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

/** Remaining time at `deviceNow`, corrected for the measured skew. */
export function trialRemaining(
  endsAt: string | null,
  skewMs: number,
  deviceNow: number,
): { h: number; m: number; s: number; done: boolean } {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(end)) return { h: 0, m: 0, s: 0, done: true };
  return splitRemaining(end - (deviceNow + skewMs));
}

/** "23h 45m 12s" — units are translated by the caller (trial.time.h/m/s). */
export function formatRemaining(
  r: { h: number; m: number; s: number },
  units: { h: string; m: string; s: string },
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${r.h}${units.h} ${pad(r.m)}${units.m} ${pad(r.s)}${units.s}`;
}

/** The two-subject rule as the UI applies it: exactly two, or all of them when
 *  the grade studies fewer. The database accepts one or two. */
export const TRIAL_SUBJECTS = 2;
export function requiredTrialSubjects(available: number): number {
  return Math.max(0, Math.min(TRIAL_SUBJECTS, available));
}

/** The BFF's trial refusal keys → the app's own store-safe sentences. The web
 *  strings for these talk about subscribing, which the Android binary cannot. */
export function trialErrorKey(key: string): string {
  if (key.startsWith("mob.")) return key; // network / session / server
  if (key === "trial.err.alreadyUsed") return "mob.trial.err.used";
  if (key === "trial.err.limitReached") return "mob.trial.err.limit";
  if (key === "trial.err.alreadyFree" || key === "trial.err.alreadyCovered") {
    return "mob.trial.err.covered";
  }
  if (key === "trial.err.tooMany" || key === "trial.err.noSubjects" || key === "trial.err.badSubject") {
    return "mob.trial.err.subjects";
  }
  if (key === "sub.err.notYourChild") return key;
  return "mob.trial.err.generic";
}
