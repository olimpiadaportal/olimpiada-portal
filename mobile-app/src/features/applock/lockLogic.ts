// PURE app-lock timing decision (no native imports — unit-tested in
// __tests__/applock.test.ts). The overlay locks a RESTORED session at cold
// start and any session that sat in the background longer than the grace
// window; a fresh interactive login is itself the identity proof and never
// locks.

/** Background grace window: relock only after MORE than 60s away. */
export const LOCK_BACKGROUND_MS = 60_000;

export function shouldLock(opts: {
  /** SecureStore olympiq.appLock flag. */
  enabled: boolean;
  signedIn: boolean;
  /** True only for the first auth settle after process start. */
  coldStart: boolean;
  /** Epoch ms taken on AppState "background"; null = never backgrounded. */
  backgroundedAt: number | null;
  now: number;
}): boolean {
  if (!opts.enabled || !opts.signedIn) return false;
  if (opts.coldStart) return true;
  if (opts.backgroundedAt === null) return false;
  return opts.now - opts.backgroundedAt > LOCK_BACKGROUND_MS;
}
