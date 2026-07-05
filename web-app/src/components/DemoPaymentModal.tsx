"use client";

// Round 11 (item 2) — payment confirmation sheet for subject additions.
//
// PAYMENT-FIRST contract: whenever the pending Manage-Subjects diff contains
// ANY addition, this sheet opens BEFORE the server apply — in BOTH 'demo' and
// 'real' payment modes. There is no real provider yet, so this cosmetic sheet
// IS the payment flow for now; when the provider lands, 'real' mode swaps this
// modal for the provider's checkout at this exact seam, while the actual
// charge/authorization seam stays SERVER-side (updateSubscriptionSubjectsAction
// → re-pricing RPCs). Removal-only changes never show a payment dialog.
//
// The card fields are purely COSMETIC — never validated, never charged, never
// stored, never sent anywhere. The displayed price is the AUTHORITATIVE server
// quote (quote_child_subscription: base / sibling discount / total) for the
// NEW full subject set; the client never sends amounts. Confirm runs the
// provided onConfirm callback (submits the server action); cancel/close applies
// NOTHING — the parent's checkbox selection stays for a retry.
import { Modal } from "@/components/Modal";

export type DemoPayQuote = {
  base: number;
  discountPercent: number;
  discount: number;
  total: number;
  currency: string;
};

export function DemoPaymentModal({
  isOpen,
  quote,
  intervalLabel,
  pending,
  onConfirm,
  onCancel,
  dict,
}: {
  isOpen: boolean;
  /** Latest AUTHORITATIVE server quote for the desired set; null while calculating. */
  quote: DemoPayQuote | null;
  /** Translated billing-interval label (e.g. "Aylıq"). */
  intervalLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={tt("pay.title")}
      closeLabel={tt("dpay.cancel")}
    >
      {/* Reuses the Add-Child wizard's .pay-* look; .dpay-card drops the outer
          card frame so it sits cleanly inside the shared modal panel. */}
      <div className="pay-card dpay-card">
        <span className="pay-demo-badge">{tt("pay.demoBadge")}</span>
        <p className="muted" style={{ margin: "10px 0 2px" }}>
          {tt("pay.note")}
        </p>

        {/* Cosmetic card fields — NEVER validated / charged / stored. */}
        <div className="pay-field">
          <span className="field-label">{tt("pay.cardName")}</span>
          <input type="text" autoComplete="off" placeholder="Ad Soyad" />
        </div>
        <div className="pay-field">
          <span className="field-label">{tt("pay.cardNumber")}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="4242 4242 4242 4242"
          />
        </div>
        <div className="pay-grid">
          <div className="pay-field">
            <span className="field-label">{tt("pay.expiry")}</span>
            <input type="text" autoComplete="off" placeholder="MM/YY" />
          </div>
          <div className="pay-field">
            <span className="field-label">{tt("pay.cvc")}</span>
            <input type="text" inputMode="numeric" autoComplete="off" placeholder="123" />
          </div>
        </div>

        {/* Server-quoted breakdown for the NEW full subject set — base /
            sibling discount / final total (never computed client-side). */}
        <div className="wizard-summary dpay-total">
          {quote ? (
            <>
              <div className="quote-row">
                <span className="q-label">{tt("pay.subtotal")}</span>
                <span>
                  {quote.base} {quote.currency}
                </span>
              </div>
              <div className="quote-row">
                <span className="q-label">{tt("pay.discount")}</span>
                <span>
                  {quote.discountPercent > 0
                    ? `−${quote.discountPercent}% (−${quote.discount} ${quote.currency})`
                    : "0%"}
                </span>
              </div>
              <div className="quote-total">
                <span>{tt("pay.total")}</span>
                <span>
                  {quote.total} {quote.currency} / {intervalLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="quote-row">
              <span className="q-label">{tt("pay.total")}</span>
              <span>{tt("sub.calculating")}</span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
            {tt("dpay.cancel")}
          </button>
          {/* Confirm stays locked until the authoritative quote is displayed. */}
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            disabled={pending || !quote}
          >
            {pending ? tt("pay.processing") : tt("pay.payNow")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
