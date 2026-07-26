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
