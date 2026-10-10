// A 1-second countdown to the end of a free-access window, on SERVER time.
//
// The skew between the device clock and the database's clock is measured from
// the answer that carried `endsAt` (see lib/trialClock), so every platform
// shows the same remaining time. `onDone` fires once, when the window closes
// while the screen is open — the caller refetches, and the database (not this
// timer) decides that access has ended.
import { useEffect, useRef, useState } from "react";
import { clockSkewMs, trialRemaining } from "@/lib/trialClock";

export function useTrialCountdown(
  endsAt: string | null,
  serverNow: string | null,
  receivedAt: number,
  onDone?: () => void,
) {
  const skew = clockSkewMs(serverNow, receivedAt);
  const [now, setNow] = useState(() => Date.now());
  const remaining = trialRemaining(endsAt, skew, now);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (remaining.done && endsAt && fired.current !== endsAt) {
      fired.current = endsAt;
      onDone?.();
    }
  }, [remaining.done, endsAt, onDone]);

  return remaining;
}
