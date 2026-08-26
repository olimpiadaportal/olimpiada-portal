// The purchase terms a parent sees BEFORE authorising a charge.
//
// WHY THIS EXISTS AS A COMPONENT rather than a paragraph in one page: the same
// facts have to appear in two places for two different reasons.
//
//   * On the PRICING page, because docs/STORE_PAYMENTS_COMPLIANCE.md §8.4 records
//     that no EU-style cooling-off right exists in Azerbaijan, so our refund
//     policy is CONTRACTUAL and must be written explicitly, in Azerbaijani,
//     before the parent authorises the first charge.
//   * Above the PAY button, because Visa and Mastercard both require the
//     refund/cancellation policy to be disclosed at the point of sale. An
//     undisclosed no-refund policy loses the chargeback by default — and then a
//     dispute fee on top.
//
// Every line states something the code already does: no refunds
// (cancelChildSubscriptionCore), access kept to the paid period end
// (recompute_child_access), renewal is manual (ABB has not approved recurring),
// per-subject cycles (migration 109), lifetime olympiad access (purchases are
// never deleted).
//
// A server component holding no state: it takes already-translated strings so
// it can be dropped into any surface without dragging i18n along.

type Dict = Record<string, string>;

export function PurchaseTerms({
  d,
  compact = false,
}: {
  d: Dict;
  /** Above a pay button: the essentials only, no heading. */
  compact?: boolean;
}) {
  const lines = compact
    ? [d["terms.norefund"], d["terms.manual"]]
    : [
        d["terms.norefund"],
        d["terms.manual"],
        d["terms.percycle"],
        d["terms.olympiad"],
        d["terms.currency"],
      ];

  return (
    <section className={compact ? "pterms is-compact" : "pterms"}>
      {compact ? null : <h2 className="pterms-title">{d["terms.title"]}</h2>}
      <ul className="pterms-list">
        {lines.filter(Boolean).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {compact ? <p className="pterms-ack">{d["terms.ack"]}</p> : null}
    </section>
  );
}
