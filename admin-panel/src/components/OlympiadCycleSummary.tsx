"use client";

// Round 49 — live "what will the students actually get?" summary for an
// olympiad package. Shown right under the per-attempt count field on BOTH the
// create and the edit form, and recomputed as the admin types the count or
// picks/uploads a grade's pool.
//
// It answers three questions the count field alone cannot:
//   • how big each grade's pool is (never the same number as the count),
//   • how many attempts one full cycle takes (ceil(pool / count)),
//   • that the cycle belongs to EACH STUDENT separately.
// Pure presentation — every number comes from tested helpers.
import type { Locale } from "@/i18n/config";
import {
  estimateCycleAttempts,
  fillTemplate,
  gradeLabel,
  parsePerAttempt,
  poolMeetsPerAttempt,
} from "@/lib/admin/olympiad-per-attempt";

export type CycleGrade = {
  /** React key — grade id (edit) or the selected grade's id (create). */
  key: string;
  /** DB grade name, used when the level is unknown. */
  name: string;
  level: number;
  /** Published (edit) or uploaded-and-valid (create) pool size. */
  pool: number;
};

export function OlympiadCycleSummary({
  dict,
  locale,
  perAttemptRaw,
  grades,
}: {
  dict: Record<string, string>;
  locale: Locale;
  /** Raw field value — an out-of-range/empty entry simply shows no estimate. */
  perAttemptRaw: string;
  grades: CycleGrade[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const perAttempt = parsePerAttempt(perAttemptRaw);

  return (
    <div className="field oly-cycle">
      <span className="field-label">{tt("oly2.cycleTitle")}</span>
      {grades.length === 0 || perAttempt === null ? (
        <p className="hint">{tt("oly2.cycleEmpty")}</p>
      ) : (
        <ul className="oly-cycle-list">
          {grades.map((g) => {
            const label = gradeLabel(locale, g.level, g.name);
            // A grade whose pool is still empty is simply "awaiting its file" —
            // not an error yet (the create flow uploads it a few fields below).
            if (g.pool <= 0) {
              return (
                <li key={g.key} className="muted">
                  {fillTemplate(tt("oly2.cycleAwaiting"), { grade: label })}
                </li>
              );
            }
            const ok = poolMeetsPerAttempt(g.pool, perAttempt);
            return (
              <li key={g.key} className={ok ? undefined : "form-error"}>
                {ok
                  ? fillTemplate(tt("oly2.cycleRow"), {
                      grade: label,
                      pool: g.pool,
                      n: estimateCycleAttempts(g.pool, perAttempt),
                    })
                  : fillTemplate(tt("oly2.cycleShortRow"), {
                      grade: label,
                      pool: g.pool,
                      count: perAttempt,
                    })}
              </li>
            );
          })}
        </ul>
      )}
      <span className="hint">{tt("oly2.cyclePerStudent")}</span>
    </div>
  );
}
