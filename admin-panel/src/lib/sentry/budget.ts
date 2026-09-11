// A HARD, CODE-LEVEL CEILING ON HOW MANY EVENTS THIS PROCESS MAY SEND.
//
// A DELIBERATE COPY of web-app/src/lib/observability/sentryBudget.ts. The three
// apps in this repo share no package and deploy independently — the same way
// scrub.ts is a sibling of the web app's scrubber rather than an import of it —
// so the module is duplicated and the LIMITS differ per app. Keep the logic in
// step; the numbers are supposed to diverge.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
// The Sentry Developer (free) plan is 5,000 ERROR OCCURRENCES per month for the
// whole ORGANISATION — shared by the three projects in this repo — counted per
// occurrence, not per issue, and it cannot buy overage. When it is gone there is
// no monitoring at all until the 1st of the next month.
//
// Every other control in this app reduces events that are *already* rare:
// `ignoreErrors` drops known noise, the scrubber drops what must not be seen.
// Neither bounds the one shape that actually empties a quota — the SAME fault
// repeating thousands of times in minutes. A React render loop, a retry storm, a
// Supabase outage answering every request with `TypeError: fetch failed`.
// `sampleRate` does not bound it either: a loop outruns a sampler, and sampling
// is the wrong tool anyway because it throws away the RARE events (a failed
// payment) that this integration exists to capture.
//
// So the cap is deterministic, not statistical: a rolling budget enforced in
// `beforeSend`, the last hook that runs before an event reaches the transport.
//
// ---------------------------------------------------------------------------
// THE ARITHMETIC — the numbers in options.ts are derived, not guessed
// ---------------------------------------------------------------------------
// 5,000/month org-wide. Hold back 1,000 as headroom for the bursty, genuinely
// actionable incidents the integration is FOR, leaving 4,000 to allocate:
//
//     web-app      2,400 / month  ~  80 / day   - the families are in this one
//     mobile-app   1,000 / month  ~  33 / day   - 12 closed testers today
//     admin-panel    600 / month  ~  20 / day   - one operator, at the keyboard
//
// Those are FLEET numbers. This budget is PER PROCESS, and the difference is the
// design rather than a shortcut:
//
//   * A process here is one serverless instance, one browser tab, or one app
//     launch. Ten different users hitting the same bug still produce ten
//     reports - BREADTH survives, and breadth is what says a bug is widespread
//     rather than one person having a broken browser extension.
//   * What the budget kills is DEPTH: the same fault repeating inside ONE
//     process. That is the shape that spends a month in an afternoon.
//
// Hence three limits rather than one, each answering a different failure:
//
//   perIssuePerHour  one repeating fault costs a handful of events, not a
//                    thousand. This is the line that survives an outage.
//   perHour          a burst of DIFFERENT faults (a bad deploy) is bounded too,
//                    which a fingerprint cap alone would not do: 200 distinct
//                    errors would each get their own allowance.
//   perDay           a multi-hour outage cannot spend more than roughly one day
//                    of the app's fleet allocation from a single process.
//
// ---------------------------------------------------------------------------
// THE RESERVE, AND THE BUG IT FIXES
// ---------------------------------------------------------------------------
// The three limits above, applied in the obvious order, have a defect that only
// shows up on the one occasion the tool is being paid for. `perHour` was tested
// FIRST, so a process already at its hourly ceiling — which is to say a process
// in the middle of an incident — dropped the FIRST OCCURRENCE of a fingerprint
// it had never seen before. The event most likely to be the new fault, thrown
// away to protect budget that a fault already being reported had spent. A cap
// that discards the one event you needed is worse than no cap.
//
// So the order is inverted (per-issue first, global second) and the global line
// gains a small reserve that ONLY a novel fingerprint may draw on:
//
//   novelPerHour  events per rolling hour that may be admitted OVER `perHour`
//                 or `perDay`, and only for a fingerprint with no admitted
//                 occurrence inside the last hour.
//   novelPerDay   the same allowance bounded across the rolling day, so an
//                 incident lasting twelve hours cannot draw the hourly reserve
//                 twelve times over.
//
// A repeat offender can never reach the reserve — by the time it is a repeat
// offender it is no longer novel — so the global cap throttles exactly what it
// should: the SAME faults, again. The worst case stays arithmetic:
//
//     max per process per hour  =  perHour + novelPerHour  =  10 + 3  =  13
//     max per process per day   =  perDay  + novelPerDay   =  30 + 6  =  36
//
// This panel's slice of the org-wide 5,000/month is ~600, i.e. ~20/day across
// the fleet. 36 is therefore still under two days of it from ONE runaway
// process — the same order of magnitude the bare 30 was chosen to hold, and the
// reserve is the cheapest three events a month this file spends.
//
// WHAT THIS IS NOT: a fleet-wide cap. No per-process counter can be one, and
// pretending otherwise would be the real defect. The org-wide hard stop is the
// per-key rate limit and spend allocation configured in the Sentry UI (see the
// owner notes in STATUS.md). This code is what stops the ordinary runaway from
// ever needing it.
//
// ---------------------------------------------------------------------------
// A DROPPED EVENT IS NOT A SILENT EVENT
// ---------------------------------------------------------------------------
// Returning `null` from `beforeSend` makes the SDK call
// `recordDroppedEvent("before_send", ...)` (@sentry/core client.js), which is
// reported to Sentry in a periodic CLIENT REPORT. Those cost no quota and show
// up on the project's Stats page as discarded events - so "the budget closed" is
// still distinguishable from "nothing broke", which is the failure mode a silent
// cap would otherwise have.

/** Milliseconds in the two windows the budget rolls over. */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface EventBudgetLimits {
  /** Events of ANY kind this process may send per rolling hour. */
  perHour: number;
  /** Events of any kind this process may send per rolling 24 hours. */
  perDay: number;
  /** Events sharing ONE fingerprint this process may send per rolling hour. */
  perIssuePerHour: number;
  /**
   * HEADROOM ABOVE `perHour` THAT ONLY A NEVER-SEEN-THIS-HOUR FINGERPRINT MAY
   * CLAIM. See the header: without it, the first occurrence of a new fault is
   * dropped precisely when the process is busy, which is when new faults appear.
   *
   * Optional, and it DEFAULTS TO ZERO on purpose - a budget constructed without
   * one behaves exactly as it did before, so an existing caller cannot silently
   * gain headroom it never reasoned about. Every budget this repo actually ships
   * sets it explicitly, and a contract test asserts that.
   */
  novelPerHour?: number;
  /** The same reserve bounded across the rolling day. Defaults to zero. */
  novelPerDay?: number;
  /**
   * How many distinct fingerprints to keep counters for. A long-lived Node
   * process seeing thousands of distinct errors must not grow a map forever, so
   * the least recently admitted key is evicted. Eviction can only ever let MORE
   * events through, never fewer, so it is safe by construction - and `perHour`
   * and `perDay` still hold above it.
   */
  maxTrackedIssues?: number;
}

export interface EventBudgetStats {
  sentLastHour: number;
  sentLastDay: number;
  droppedTotal: number;
  trackedIssues: number;
  /** Of `sentLastHour`, how many were funded by the novel-fingerprint reserve. */
  reserveLastHour: number;
  /** Of `sentLastDay`, how many were funded by the reserve. */
  reserveLastDay: number;
}

export interface EventBudget {
  /**
   * Ask permission to send one event. Returns true and SPENDS budget, or
   * returns false and spends nothing.
   *
   * `now` is injectable so tests can drive the clock instead of sleeping.
   */
  admit(fingerprint: string, now?: number): boolean;
  /** Diagnostics, read by tests. Never sent anywhere. */
  stats(now?: number): EventBudgetStats;
}

/** Drop timestamps that have fallen out of the window. Arrays stay sorted. */
function trim(timestamps: number[], cutoff: number): void {
  let drop = 0;
  while (drop < timestamps.length && (timestamps[drop] as number) <= cutoff) drop += 1;
  if (drop > 0) timestamps.splice(0, drop);
}

/**
 * How many entries are newer than `cutoff`. The arrays are appended in
 * increasing time order, so counting backwards and stopping at the first stale
 * entry is exact rather than a shortcut.
 */
function countAfter(timestamps: number[], cutoff: number): number {
  let count = 0;
  for (let i = timestamps.length - 1; i >= 0; i -= 1) {
    if ((timestamps[i] as number) > cutoff) count += 1;
    else break;
  }
  return count;
}

export function createEventBudget(limits: EventBudgetLimits): EventBudget {
  const maxTracked = limits.maxTrackedIssues ?? 100;
  const novelPerHour = limits.novelPerHour ?? 0;
  const novelPerDay = limits.novelPerDay ?? 0;
  // TWO LEDGERS, NOT ONE, and the separation is what makes the reserve a
  // reserve. `ordinary` is spent against `perHour`/`perDay`; `reserve` is spent
  // against `novelPerHour`/`novelPerDay`. If a reserve-funded admission were
  // also charged to `ordinary` it would eat the ordinary allowance it was
  // supposed to sit ABOVE, and a quiet hour after a burst of novel faults would
  // find its budget already gone. Entries are appended only on an ADMISSION, so
  // both arrays are bounded by their own limits.
  const ordinary: number[] = [];
  const reserve: number[] = [];
  // Insertion-ordered, so the first key is the least recently admitted - which
  // is what makes a plain Map LRU enough here without a dependency.
  const perIssue = new Map<string, number[]>();
  let droppedTotal = 0;

  return {
    admit(fingerprint: string, now: number = Date.now()): boolean {
      const dayAgo = now - DAY_MS;
      const hourAgo = now - HOUR_MS;
      trim(ordinary, dayAgo);
      trim(reserve, dayAgo);

      // ---------------------------------------------------------------
      // 1. PER-ISSUE FIRST. This ordering is the fix, not a tidy-up.
      //
      // The global check used to run first, so a process at its hourly
      // ceiling dropped the FIRST occurrence of a fingerprint it had never
      // seen - the single event most likely to be the new fault, discarded
      // to protect budget that an already-reported fault had spent.
      // Resolving the fingerprint first is what makes "is this novel?"
      // answerable before the global decision is taken.
      // ---------------------------------------------------------------
      const issue = perIssue.get(fingerprint);
      if (issue) trim(issue, hourAgo);
      const seenThisHour = issue?.length ?? 0;

      if (seenThisHour >= limits.perIssuePerHour) {
        // A repeat offender, over its own line. It never reaches the reserve
        // below - by definition the reserve is for faults nobody has seen.
        droppedTotal += 1;
        return false;
      }

      // ---------------------------------------------------------------
      // 2. GLOBAL, with headroom held back for novel fingerprints.
      // ---------------------------------------------------------------
      const overGlobal =
        ordinary.length >= limits.perDay || countAfter(ordinary, hourAgo) >= limits.perHour;

      let fromReserve = false;
      if (overGlobal) {
        const isNovel = seenThisHour === 0;
        if (
          !isNovel ||
          countAfter(reserve, hourAgo) >= novelPerHour ||
          reserve.length >= novelPerDay
        ) {
          droppedTotal += 1;
          return false;
        }
        fromReserve = true;
      }

      // ---------------------------------------------------------------
      // 3. ADMIT, and record it against every window it spends from.
      // ---------------------------------------------------------------
      if (issue) {
        // Re-insert so the freshest issue sits last and eviction stays LRU.
        perIssue.delete(fingerprint);
        issue.push(now);
        perIssue.set(fingerprint, issue);
      } else {
        if (perIssue.size >= maxTracked) {
          const oldest = perIssue.keys().next().value;
          if (oldest !== undefined) perIssue.delete(oldest);
        }
        perIssue.set(fingerprint, [now]);
      }

      (fromReserve ? reserve : ordinary).push(now);
      return true;
    },

    stats(now: number = Date.now()): EventBudgetStats {
      const hourAgo = now - HOUR_MS;
      const dayAgo = now - DAY_MS;
      const since = (window: number[], cutoff: number) =>
        window.filter((t) => t > cutoff).length;
      return {
        // What actually left the process: both ledgers together.
        sentLastHour: since(ordinary, hourAgo) + since(reserve, hourAgo),
        sentLastDay: since(ordinary, dayAgo) + since(reserve, dayAgo),
        droppedTotal,
        trackedIssues: perIssue.size,
        reserveLastHour: since(reserve, hourAgo),
        reserveLastDay: since(reserve, dayAgo),
      };
    },
  };
}

/**
 * The shape `fingerprintEvent` needs. Structural rather than `ErrorEvent` on
 * purpose: it keeps this module free of the SDK at runtime and lets a test pass
 * a plain object literal.
 */
export interface FingerprintableEvent {
  fingerprint?: string[];
  message?: string;
  transaction?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
}

/**
 * Collapse an event to a stable grouping key.
 *
 * This is NOT Sentry's server-side grouping - that runs after ingest, which is
 * precisely the moment the quota has already been spent. It only has to be
 * stable enough that the same repeating fault keeps hashing to the same string
 * inside one process.
 *
 * The numeric normalisation is the part that earns its keep: `Row 4821 failed`,
 * `Row 4822 failed`, ... are ONE fault and must not read as a thousand
 * fingerprints, which would hand each of them its own per-issue allowance. Ids,
 * ports, timestamps and uuids collapse for the same reason. Note this runs AFTER
 * the scrubber, so anything identifying is already a placeholder: the key can
 * never carry a child's name or login id.
 */
export function fingerprintEvent(event: FingerprintableEvent): string {
  if (event.fingerprint?.length) return event.fingerprint.join("|").slice(0, 200);

  const values = event.exception?.values ?? [];
  // `linkedErrorsIntegration` PREPENDS causes, so the LAST value is the error
  // that was actually thrown - the same one `ignoreErrors` matches against.
  const thrown = values[values.length - 1];
  const parts = [
    thrown?.type ?? "",
    thrown?.value ?? event.message ?? "",
    event.transaction ?? "",
  ];
  return normalize(parts.join("|")).slice(0, 200);
}

function normalize(text: string): string {
  return text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "#uuid")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#hex")
    .replace(/\d+/g, "#");
}
