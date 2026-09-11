// THE TWO QUOTA DEFENCES THAT ARE NOT THE SCRUBBER'S JOB: a hard ceiling on how
// many events one app launch may send, and the transport error shapes the
// scrubber's ignore list does not cover.
//
// A DELIBERATE SIBLING of web-app/src/lib/observability/sentryBudget.ts and
// admin-panel/src/lib/sentry/budget.ts. The three apps share no package and ship
// independently — the same reason `sentryScrub.ts` is a sibling of the web app's
// scrubber rather than an import of it. Keep the LOGIC in step; the NUMBERS are
// supposed to differ.
//
// ---------------------------------------------------------------------------
// WHY A CEILING AT ALL
// ---------------------------------------------------------------------------
// The Sentry Developer (free) plan is 5,000 ERROR OCCURRENCES a month for the
// whole ORGANISATION — this app plus the two web projects — counted per
// occurrence, not per issue, and it cannot buy overage. When it is gone there is
// no monitoring for anyone until the 1st.
//
// Every other control reduces events that are already rare: `ignoreErrors` drops
// known noise, `scrubEvent` drops what must not be seen. None of them bounds the
// shape that actually empties a quota — the SAME fault repeating. On a phone
// that is a render loop in a screen, a `useEffect` retrying a failed request, or
// a boot-gate failure that re-fires every time the app is foregrounded.
// `sampleRate` cannot bound it either: a loop outruns a sampler, and sampling
// throws away the RARE crash reports that are the whole reason for shipping this
// SDK to twelve testers.
//
// ---------------------------------------------------------------------------
// THE ARITHMETIC — the numbers in sentry.ts are derived, not guessed
// ---------------------------------------------------------------------------
// 5,000/month org-wide. Hold 1,000 back as headroom for real, bursty incidents,
// leaving 4,000 to allocate:
//
//     web-app      2,400 / month  ~  80 / day   - the families are in it
//     mobile-app   1,000 / month  ~  33 / day   - 12 closed testers today
//     admin-panel    600 / month  ~  20 / day   - one operator, at the keyboard
//
// Those are FLEET numbers, and this budget is PER PROCESS — here, per app
// launch. That is the design, not a shortcut:
//
//   * Twelve testers all hitting the same crash still produce twelve reports.
//     BREADTH survives, and breadth is what says "every device" rather than
//     "one device". A global cap would have destroyed exactly that signal.
//   * What is bounded is DEPTH: the same fault repeating inside one running app.
//
// Hence three limits, each for a different failure:
//
//   perIssuePerHour  one repeating crash costs a handful of events, not a
//                    thousand — the line that survives a retry loop.
//   perHour          a burst of DIFFERENT faults (a bad OTA update) is bounded
//                    too, which a fingerprint cap alone would not do.
//   perDay           a phone left in a broken state all day cannot spend more
//                    than about one day of the app's fleet allocation.
//
// WHAT THIS IS NOT: a fleet-wide cap — no per-device counter can be. The
// org-wide hard stop is the per-key rate limit set in the Sentry UI (see the
// owner notes in STATUS.md). This code stops the ordinary runaway from ever
// reaching it.
//
// NATIVE CRASHES DO NOT PASS THROUGH HERE. `beforeSend` is a JS hook; a hard
// native crash on iOS or Android is captured by the native SDK and uploaded on
// the next launch without consulting it. Those are rare and always worth having,
// so the gap is the right way round — but it means this budget bounds the JS
// side, not literally everything.
//
// A DROPPED EVENT IS NOT A SILENT EVENT: returning null from `beforeSend` makes
// the SDK record a client report with reason `before_send`, which is sent
// separately, costs no quota, and shows on the project's Stats page as a
// discarded event. "The budget closed" stays distinguishable from "nothing
// broke".

/**
 * NODE / UNDICI TRANSPORT SHAPES, kept here rather than in `sentryScrub.ts`
 * because that file's `IGNORED_ERRORS` is the scrubber's list and this is a
 * quota decision — and because the three apps' lists have to be verifiably the
 * same set, which is easier when each one lives beside its own budget.
 *
 * HONEST NOTE ON RELEVANCE, because a future reader will wonder: React Native's
 * `fetch` is XHR-backed and says "Network request failed" (already in
 * `IGNORED_ERRORS`), so undici's texts are NOT what this app throws today. They
 * are here for three reasons that cost nothing: any JS in this repo can end up
 * running under Node (scripts, tests, a future server-rendered surface); Expo's
 * WinterCG `fetch` and future RN releases move toward these names; and the three
 * ignore lists in this repository are meant to be one list in three places, so
 * that a fix to one is not silently absent from the other two.
 *
 * The shapes, read off a running Node 24.15.0 rather than remembered:
 *   connection refused / DNS failure / TLS failure
 *       -> TypeError: fetch failed  (message EXACTLY "fetch failed"; the real
 *          reason — ECONNREFUSED, ENOTFOUND — hangs off `error.cause`)
 *   socket cut mid-body
 *       -> TypeError: terminated    (cause: SocketError "other side closed",
 *          code UND_ERR_SOCKET)
 *   AbortSignal.timeout()
 *       -> TimeoutError: The operation was aborted due to timeout
 *
 * The first two are ANCHORED regexes, not substrings: `ignoreErrors` matches
 * substrings, and a bare "terminated" would also swallow a real "Upload
 * terminated". Sentry tests the LAST entry of `exception.values` — the thrown
 * error, since linkedErrors prepends causes — so the outer text is what matches;
 * the codes are listed for libraries that throw them unwrapped.
 */
export const NODE_TRANSPORT_IGNORED_ERRORS: readonly (string | RegExp)[] = [
  /^fetch failed$/,
  /^terminated$/,
  "The operation was aborted due to timeout",
  "other side closed",
  // Every undici code at once: UND_ERR_CONNECT_TIMEOUT, UND_ERR_HEADERS_TIMEOUT,
  // UND_ERR_BODY_TIMEOUT, UND_ERR_SOCKET.
  "UND_ERR_",
  "Connect Timeout Error",
  "Headers Timeout Error",
  "Body Timeout Error",
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\b/,
];

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
   * A reserve ONLY a never-before-seen fingerprint may draw on, ABOVE
   * `perHour`/`perDay`.
   *
   * Without it the global cap is checked first and a novel crash is dropped
   * during a busy hour — which is the one event worth having. A cap that
   * discards the first occurrence of a new fault is worse than no cap: the
   * repeats it throttles are, by definition, things already reported.
   * Second and later occurrences are not novel, so what the global cap still
   * throttles is exactly the repetition it was added for.
   */
  novelPerHour?: number;
  /** The same reserve bounded across the rolling day. Defaults to zero. */
  novelPerDay?: number;
  /**
   * How many distinct fingerprints to keep counters for. An app left open for
   * hours, seeing many distinct errors, must not grow a map forever, so
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

export function createEventBudget(limits: EventBudgetLimits): EventBudget {
  const maxTracked = limits.maxTrackedIssues ?? 100;
  const novelPerHour = limits.novelPerHour ?? 0;
  const novelPerDay = limits.novelPerDay ?? 0;
  // TWO LEDGERS, NOT ONE, and the separation is what makes the reserve a
  // reserve. `sent` is spent against perHour/perDay; `reserve` against
  // novelPerHour/novelPerDay. Charging a reserve-funded admission to `sent`
  // would eat the ordinary allowance it is supposed to sit ABOVE, so a quiet
  // hour following a burst of novel faults would find its budget already gone.
  // Entries are appended only on an ADMISSION, so both stay bounded.
  const sent: number[] = [];
  const reserve: number[] = [];
  // Insertion-ordered, so the first key is the least recently admitted - which
  // is what makes a plain Map LRU enough here without a dependency.
  const perIssue = new Map<string, number[]>();
  let droppedTotal = 0;

  return {
    admit(fingerprint: string, now: number = Date.now()): boolean {
      trim(sent, now - DAY_MS);

      const hourAgo = now - HOUR_MS;
      let inLastHour = 0;
      for (let i = sent.length - 1; i >= 0; i -= 1) {
        if ((sent[i] as number) > hourAgo) inLastHour += 1;
        else break;
      }

      const issue = perIssue.get(fingerprint);
      const isNovel = issue === undefined;

      if (sent.length >= limits.perDay || inLastHour >= limits.perHour) {
        // The ordinary allowance is spent. A fingerprint we have never seen may
        // still draw on its own reserve — this is the whole point of the split.
        if (!isNovel) {
          droppedTotal += 1;
          return false;
        }
        trim(reserve, now - DAY_MS);
        let reserveInHour = 0;
        for (let i = reserve.length - 1; i >= 0; i -= 1) {
          if ((reserve[i] as number) > hourAgo) reserveInHour += 1;
          else break;
        }
        if (reserve.length >= novelPerDay || reserveInHour >= novelPerHour) {
          droppedTotal += 1;
          return false;
        }
        if (perIssue.size >= maxTracked) {
          const oldest = perIssue.keys().next().value;
          if (oldest !== undefined) perIssue.delete(oldest);
        }
        perIssue.set(fingerprint, [now]);
        reserve.push(now);
        return true;
      }

      if (issue) {
        trim(issue, hourAgo);
        if (issue.length >= limits.perIssuePerHour) {
          droppedTotal += 1;
          return false;
        }
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

      sent.push(now);
      return true;
    },

    stats(now: number = Date.now()): EventBudgetStats {
      const hourAgo = now - HOUR_MS;
      return {
        sentLastHour: sent.filter((t) => t > hourAgo).length,
        sentLastDay: sent.filter((t) => t > now - DAY_MS).length,
        droppedTotal,
        trackedIssues: perIssue.size,
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
  exception?: { values?: { type?: string; value?: string }[] };
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
