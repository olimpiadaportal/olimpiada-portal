"use client";

// The child's free-trial card, at the top of the child dashboard (2026-10-10).
//
// "Your Free Trial · 23h 45m 12s remaining · Subjects: …", and once the window
// is over, "Your Free Trial Has Ended". CHILD-FACING: it never says buy, pay or
// subscribe — a child has no purchase surface on any platform; the ended state
// sends them to their parent.
//
// The remaining time is computed against the SERVER clock (`serverNow`, read in
// the same request as `endsAt`), so a device whose clock is wrong still shows
// the right time, and the web, iOS and Android countdowns agree.
import { FreeTrialCountdown } from "@/components/FreeTrialCountdown";

type Props = {
  endsAt: string;
  serverNow: string | null;
  active: boolean;
  extended: boolean;
  subjects: string[];
  d: Record<string, string>;
};

export function ChildTrialCard({ endsAt, serverNow, active, extended, subjects, d }: Props) {
  if (!active) {
    return (
      <section className="child-trial is-ended" role="status">
        <p className="child-trial-title">{d["trial.child.ended"]}</p>
        <p className="child-trial-note">{d["trial.child.endedNote"]}</p>
      </section>
    );
  }
  return (
    <section className="child-trial" aria-labelledby="child-trial-title">
      <div className="child-trial-head">
        <p className="child-trial-title" id="child-trial-title">
          {d["trial.child.title"]}
        </p>
        {extended && <span className="child-trial-chip">{d["trial.child.extended"]}</span>}
      </div>
      <p className="child-trial-clock">
        <FreeTrialCountdown
          endsAt={endsAt}
          serverNow={serverNow ?? undefined}
          units={{ h: d["trial.time.h"], m: d["trial.time.m"], s: d["trial.time.s"] }}
          endedLabel={d["trial.child.ended"]}
        />
        <span className="child-trial-remaining">{d["trial.child.remaining"]}</span>
      </p>
      {subjects.length > 0 && (
        <p className="child-trial-subjects">
          {d["trial.child.subjects"].replace("{subjects}", subjects.join(", "))}
        </p>
      )}
    </section>
  );
}
