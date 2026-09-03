// WHICH SERVER KEYS THE STORE BINARY IS WILLING TO PUT ON SCREEN.
//
// The BFF answers refusals as i18n keys and the app renders them as-is, which is
// right for almost all of them — the server already decided what a parent should
// be told, in all three languages, and re-deciding it here is how two surfaces
// start disagreeing about the same refusal.
//
// THREE KEYS ARE THE EXCEPTION, and the reason is a rejection this app already
// collected. `gate.paymentsOff` is the web's honest sentence — "Payments are
// temporarily paused. New subscriptions and purchases are unavailable right
// now." Apple rejected the 2026-08-26 submission over precisely that string
// under Guideline 2.1.0 (App Completeness): a feature that announces itself
// unavailable reads as an unfinished feature. It also breaks this project's own
// rule that payment posture is a BUILD-TIME constant and never a server flag —
// the string reaches the screen only because a database row said so.
// `gate.giveawayFree` / `gate.freeAccess` are banned for the same reason and are
// listed alongside it in __tests__/no-payment-state.test.ts.
//
// THE KILL SWITCH STILL WORKS. The purchase is still refused, the sheet never
// opens, no money moves. Only the WORDING changes, to the neutral sentence the
// catalogue already carries in all three languages. Nothing here weakens a gate;
// it changes what a refusal sounds like.
const REWRITTEN: Record<string, string> = {
  "gate.paymentsOff": "iap.err.unavailable",
  "gate.giveawayFree": "iap.err.unavailable",
  "gate.freeAccess": "iap.err.unavailable",
};

/** The key to render for a server refusal. Unknown keys pass through. */
export function displayableServerKey(key: string): string {
  return REWRITTEN[key] ?? key;
}
