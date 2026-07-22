"use client";

// Round 11 (item 2) — payment confirmation sheet for subject additions.
// Round 32: re-priced around the mid-cycle proration model (quote_subject_change
// / apply_subject_change) — the amount confirmed here is the prorated "due now"
// top-up, never the full new recurring total.
//
// PAYMENT-FIRST contract: whenever the pending Manage-Subjects diff contains
// ANY addition, this sheet opens BEFORE the server apply — in BOTH 'demo' and
// 'real' payment modes. There is no real provider yet, so this cosmetic sheet
// IS the payment flow for now; when the provider lands, 'real' mode swaps this
// modal for the provider's checkout at this exact seam, while the actual
// charge/authorization seam stays SERVER-side (updateSubscriptionSubjectsAction
// → apply_subject_change). Removal-only changes never show a payment dialog.
//
// The card fields are purely COSMETIC — never validated, never charged, never
// stored, never sent anywhere. `quote` carries only ALREADY-FORMATTED,
// locale-aware strings built by the caller (ManageSubjects) from the
// AUTHORITATIVE server quote (quote_subject_change: prorated due-now top-up +
// the new recurring rate + when it starts) — the client never computes or
// sends amounts. Confirm runs the provided onConfirm callback (submits the
// server action); cancel/close applies NOTHING — the parent's checkbox
// selection stays for a retry.
import { Modal } from "@/components/Modal";

export type DemoPayQuote = {
  /** "12.50 AZN" — the prorated top-up due right now. Ignored when noCharge. */
  dueNowLabel: string;
  /** Full sentence: either "Then X/interval from <date>" or, when noCharge,
   *  the "no charge now — the new rate starts on <date>" sentence. */
  thenLabel: string;
  /** True when the prorated top-up is 0 (trial / weekly interval / waived
   *  under the minimum charge) — the sheet explains instead of showing 0. */
  noCharge: boolean;
};

export function DemoPaymentModal({
  isOpen,
  quote,
  pending,
  onConfirm,
  onCancel,
  dict,
}: {
  isOpen: boolean;
  /** Latest AUTHORITATIVE server quote for the pending diff; null while calculating. */
  quote: DemoPayQuote | null;
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

        {/* Round 32: the prorated top-up due NOW (never the full new recurring
            total) + the sentence explaining the new rate/date (never computed
            client-side — both come pre-formatted from the authoritative
            quote_subject_change quote). */}
        <div className="wizard-summary dpay-total">
          {quote ? (
            quote.noCharge ? (
              <p className="subjedit-note">{quote.thenLabel}</p>
            ) : (
              <>
                <div className="quote-row">
                  <span className="q-label">{tt("subjedit.dueNow")}</span>
                  <span>{quote.dueNowLabel}</span>
                </div>
                <p className="subjedit-note">{quote.thenLabel}</p>
              </>
            )
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
            {pending
              ? tt("pay.processing")
              : quote?.noCharge
                ? tt("pay.confirmNoCharge")
                : tt("pay.payNow")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
