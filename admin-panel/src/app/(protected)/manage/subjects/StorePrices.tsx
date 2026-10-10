import type { T } from "@/i18n/server";
import { PRICE_INTERVALS } from "@/lib/admin/pricing-shared";
import { loadStoreBoard, type StoreCell } from "@/lib/admin/storePriceSync";
import type { SyncIndicator } from "@/lib/admin/store-pricing-shared";
import { intervalLabels } from "./strings";
import { StoreSyncButton, type StoreSyncButtonStrings } from "./StoreSyncButton";

// Store prices beside the AZN source of truth (owner decision 2026-10-10:
// "whatever price is set in Admin → Subjects, the mobile apps must display
// that").
//
// LIVE, NOT STORED. Every cell is what App Store Connect / Google Play report
// right now, read on render; a stored copy could say "in sync" about a price
// somebody changed in a console an hour ago. The read is slow (two third
// parties), so both Subjects screens render this inside <Suspense>: the table
// and its price editors appear immediately and this card streams in after.
//
// FOUR STATES, NEVER COLLAPSED. in sync / out of sync / not created / unknown.
// "Unknown" means we could not read the store — never "out of sync", which
// would accuse a live price we did not see.

const PILL: Record<SyncIndicator, string> = {
  inSync: "pill pill-ok pill-sm",
  outOfSync: "pill pill-warn pill-sm",
  notCreated: "pill pill-muted pill-sm",
  unknown: "pill pill-muted pill-sm store-pill-unknown",
};

export function storeSyncButtonStrings(t: T): StoreSyncButtonStrings {
  return {
    syncSubject: t("subj.store.syncSubject"),
    syncAll: t("subj.store.syncAll"),
    working: t("subj.store.syncing"),
    reload: t("subj.store.reload"),
  };
}

function fill(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text);
}

function Cell({ t, label, cell }: { t: T; label: string; cell: StoreCell }) {
  return (
    <div className="store-line">
      <span className="store-name">{label}</span>{" "}
      <span className="store-price">{cell.live ?? (cell.indicator === "unknown" ? "—" : t("subj.store.none"))}</span>{" "}
      <span className={PILL[cell.indicator]}>{t(`subj.store.ind.${cell.indicator}`)}</span>
      {cell.indicator === "outOfSync" && cell.expected && (
        <span className="store-expected">{fill(t("subj.store.expected"), { price: cell.expected })}</span>
      )}
    </div>
  );
}

export async function StorePrices({
  t,
  subjects,
  single = false,
}: {
  t: T;
  subjects: { id: string; display: string; prices: Partial<Record<(typeof PRICE_INTERVALS)[number], string>> }[];
  /** The edit page: one subject, no "sync all", no subject column. */
  single?: boolean;
}) {
  const board = await loadStoreBoard(subjects);
  const intervals = intervalLabels(t);
  const buttons = storeSyncButtonStrings(t);
  const name = new Map(subjects.map((s) => [s.id, s.display]));

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("subj.store.heading")}</h3>
        {single ? (
          subjects[0] && <StoreSyncButton mode="subject" subjectId={subjects[0].id} strings={buttons} />
        ) : (
          <StoreSyncButton mode="all" strings={buttons} />
        )}
      </div>
      <p className="section-intro">{t("subj.store.intro")}</p>
      <p className="hint">
        {fill(t("subj.store.rate"), { rate: board.rate.toFixed(2) })}
      </p>

      {board.productMapFailed && (
        <p className="form-error" role="alert">{t("subj.store.productMapFailed")}</p>
      )}
      {board.appStoreProblem && (
        <p className="form-error" role="alert">
          {fill(t("subj.store.problem.appStore"), {
            reason: t(`subj.store.err.${board.appStoreProblem}`),
          })}
        </p>
      )}
      {board.googlePlayProblem && (
        <p className="form-error" role="alert">
          {fill(t("subj.store.problem.googlePlay"), {
            reason: t(`subj.store.err.${board.googlePlayProblem}`),
          })}
        </p>
      )}

      <div className="table-wrap">
        <table className="table pricing-table store-table">
          <thead>
            <tr>
              {!single && <th>{t("subj.field.name")}</th>}
              {PRICE_INTERVALS.map((iv) => (
                <th key={iv}>{intervals[iv]}</th>
              ))}
              {!single && <th aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.subjectId}>
                {!single && <td className="pricing-subject">{name.get(row.subjectId)}</td>}
                {PRICE_INTERVALS.map((iv) => {
                  const c = row.cycles[iv];
                  return (
                    <td key={iv}>
                      {c ? (
                        <>
                          <div className="store-line store-azn">AZN {c.azn}</div>
                          <Cell t={t} label={t("subj.store.appStore")} cell={c.appStore} />
                          <Cell t={t} label={t("subj.store.googlePlay")} cell={c.googlePlay} />
                        </>
                      ) : (
                        <span className="price-not-set">{t("subj.priceNotSet")}</span>
                      )}
                    </td>
                  );
                })}
                {!single && (
                  <td className="row-actions nowrap">
                    <StoreSyncButton mode="subject" subjectId={row.subjectId} strings={buttons} compact />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The Suspense fallback: the card's frame, saying what it is waiting for. */
export function StorePricesLoading({ t }: { t: T }) {
  return (
    <section className="card" aria-busy="true">
      <div className="card-head">
        <h3>{t("subj.store.heading")}</h3>
      </div>
      <p className="muted">{t("subj.store.loading")}</p>
    </section>
  );
}
