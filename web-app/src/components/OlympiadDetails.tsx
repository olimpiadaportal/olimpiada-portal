// Shared "Ətraflı" (details) body — the labelled row list + free-text
// description block. ONE implementation behind the parent catalog's details
// MODAL (components/OlympiadPurchase) and the public details PAGE
// (/olympiad-packages/[code]), so the two can never drift visually.
//
// Round-43 rule enforced here, once: a row whose value is null/empty is DROPPED
// entirely — the UI never renders "null"/"undefined"/an empty dash row.
//
// No hooks and no server-only imports → safe inside a client component and
// inside a server component alike. Callers pass already-localized labels and
// display-ready values (no i18n or business logic in this file).

export type OlympiadDetailRow = {
  label: string;
  value: string | null | undefined;
};

export function OlympiadDetailsRows({
  rows,
  description,
  descriptionLabel,
}: {
  rows: readonly OlympiadDetailRow[];
  description?: string | null;
  descriptionLabel: string;
}) {
  const visible = rows
    .map((r) => ({ label: r.label, value: (r.value ?? "").toString().trim() }))
    .filter((r) => r.value.length > 0);
  const desc = (description ?? "").trim();

  return (
    <>
      {visible.length > 0 && (
        <dl className="poly-rows">
          {visible.map((r) => (
            <div className="poly-row" key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {desc && (
        <div className="poly-det-desc">
          <div className="poly-det-desc-label">{descriptionLabel}</div>
          <p>{desc}</p>
        </div>
      )}
    </>
  );
}

/**
 * The canonical row set for a PUBLIC olympiad package.
 *
 * Round 49 review finding: the modal trigger and the standalone details page
 * each built this 8-row array by hand, byte-for-byte identical — so the two
 * could silently diverge while a comment claimed they could not. Sharing the
 * RENDERER was never enough; the DATA has to be shared too. Both public
 * surfaces now call this.
 *
 * `t` is the caller's translate function and `pkg` carries display-ready
 * strings, so this stays free of i18n setup and business logic. Empty values
 * are dropped downstream by <OlympiadDetailsRows/>.
 */
export function buildPublicOlympiadRows(
  t: (key: string) => string,
  pkg: {
    subject: string | null;
    multiGrade: boolean;
    gradeLabel: string | null;
    questionCount: number;
    questionsPerAttempt: number;
    durationMinutes: number | null;
    eventDetailText: string | null;
    saleStartText: string | null;
    saleEndText: string | null;
    priceText: string | null;
  },
): OlympiadDetailRow[] {
  return [
    { label: t("poly.det.subject"), value: pkg.subject },
    {
      label: pkg.multiGrade ? t("poly.det.grades") : t("poly.det.grade"),
      value: pkg.gradeLabel,
    },
    {
      label: t("poly.det.questions"),
      value: pkg.questionCount > 0 ? String(pkg.questionCount) : null,
    },
    {
      // Round 51 rotation: each attempt serves questions_per_attempt from the
      // pool. Shown only when it is a real SUBSET — when it equals/exceeds the
      // pool an attempt serves the whole pool and the row above already says it.
      label: t("poly.det.perAttempt"),
      value:
        pkg.questionsPerAttempt > 0 && pkg.questionsPerAttempt < pkg.questionCount
          ? String(pkg.questionsPerAttempt)
          : null,
    },
    {
      label: t("poly.det.duration"),
      value: pkg.durationMinutes
        ? `${pkg.durationMinutes} ${t("poly.det.minutes")}`
        : null,
    },
    { label: t("poly.det.eventAt"), value: pkg.eventDetailText },
    { label: t("poly.det.saleStart"), value: pkg.saleStartText },
    { label: t("poly.det.saleEnd"), value: pkg.saleEndText },
    { label: t("poly.det.price"), value: pkg.priceText },
  ];
}
