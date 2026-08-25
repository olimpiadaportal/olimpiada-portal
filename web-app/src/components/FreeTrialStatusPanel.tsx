// Free Trial status for a child: ACTIVE (subjects + live countdown) or ENDED.
//
// A server component — it renders no state of its own and takes the already
// resolved trial from the caller, so only the countdown inside it is a client
// island. Strings arrive translated; this file holds no i18n.
//
// The expired CTA lives HERE and nowhere else. This is a web surface, where
// naming a subscription is correct and legal. The same sentence must never
// reach a notification body: those are DB literals that render verbatim inside
// the purchase-silent store binaries, which is why migration 141's copy states
// what ended and stops.
import { FreeTrialCountdown } from "@/components/FreeTrialCountdown";
import type { FreeTrialState } from "@/lib/freeTrialShared";

type Dict = Record<string, string>;

export function FreeTrialStatusPanel({
  trial,
  d,
  subscribeHref,
}: {
  trial: FreeTrialState;
  d: Dict;
  subscribeHref?: string;
}) {
  if (trial.active && trial.endsAt) {
    return (
      <section className="ftrial-status">
        <div className="ftrial-status-head">
          <span className="ftrial-badge">{d["trial.badge.active"]}</span>
          <h3 className="ftrial-status-title">{d["trial.status.active"]}</h3>
        </div>

        <ul className="ftrial-status-list">
          {trial.subjects.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>

        <p className="ftrial-status-endsin">
          <span>{d["trial.status.endsIn"]}</span>{" "}
          <FreeTrialCountdown
            endsAt={trial.endsAt}
            units={{ h: d["trial.time.h"], m: d["trial.time.m"], s: d["trial.time.s"] }}
            endedLabel={d["trial.expired.title"]}
          />
        </p>

        <p className="ftrial-note">{d["trial.note.unrated"]}</p>
      </section>
    );
  }

  // USED AND ELAPSED. `used` distinguishes this from a child who never had one;
  // the caller only renders the panel in the elapsed case.
  return (
    <section className="ftrial-status is-over">
      <h3 className="ftrial-status-title">{d["trial.expired.title"]}</h3>
      <p className="ftrial-status-body">{d["trial.expired.body"]}</p>
      {trial.subjects.length > 0 ? (
        <ul className="ftrial-status-list is-muted">
          {trial.subjects.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      ) : null}
      {subscribeHref ? (
        <a className="btn btn-primary" href={subscribeHref}>
          {d["trial.expired.cta"]}
        </a>
      ) : null}
    </section>
  );
}
