"use client";

// Round 11 (item 2) — payment confirmation sheet for subject additions.
//
// The amount confirmed here is what the change costs TODAY: each added subject's
// FULL first period, starting today, at the sibling rate. Proration is retired
// (owner, 2026-08-17), so this is never a part-period top-up and never the whole
// plan's recurring total — the subjects already on the plan are untouched by
// this charge and keep their own renewal dates.
//
// PAYMENT-FIRST contract: whenever the pending Manage-Subjects diff contains
// ANY addition, this sheet opens BEFORE the server apply — in BOTH 'demo' and
// 'real' payment modes. There is no real provider yet, so this cosmetic sheet
// IS the payment flow for now; when the provider lands, 'real' mode swaps this
// modal for the provider's checkout at this exact seam, while the actual
// charge/authorization seam stays SERVER-side (updateSubscriptionSubjectsAction
// → apply_plan_change). Removal-only changes never show a payment dialog.
//
// The card fields are purely COSMETIC — never validated, never charged, never
// stored, never sent anywhere. `quote` carries only ALREADY-FORMATTED,
// locale-aware strings built by the caller (ManageSubjects) from the
// AUTHORITATIVE server quote (quote_plan_change: the due-now total plus, per
// added subject, its cycle, price and start) — the client never computes or
// sends amounts. Confirm runs the provided onConfirm callback (submits the
// server action); cancel/close applies NOTHING — the parent's selection stays
// for a retry.
import { Modal } from "@/components/Modal";

export type DemoPayQuote = {
  /** "12.50 AZN" — the amount due right now. Ignored when noCharge. */
  dueNowLabel: string;
  /** Full sentence: either what the amount buys (a full first period per added
   *  subject, starting today) or, when noCharge, the "nothing is charged now —
   *  the first payment is on <date>" sentence. */
  thenLabel: string;
  /**
   * One PRE-FORMATTED row per subject being paid for: `label` is the subject
   * with its cycle and price, `value` says when that subject renews. With
   * independent per-subject cycles a single "then X / month" line cannot
   * describe the plan, so the caller passes the rows it already built from the
   * authoritative server quote. Still strings only — this sheet never computes
   * an amount.
   */
  lines?: { label: string; value: string }[];
  /** True when nothing is due now (trial, removal-only, scheduled cycle change)
   *  — the sheet explains instead of showing 0. */
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

        {/* The amount due NOW (the added subjects' full first periods, never a
            part period and never the whole plan's recurring total), the
            sentence explaining what it buys, and one row per subject being paid
            for — all pre-formatted from the authoritative quote_plan_change
            quote, never computed client-side. */}
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
                {/* Both halves are rendered: the subject + cycle + price label
                    is the half that says WHAT is being bought, and dropping it
                    left the sheet showing dates with nothing attached to them. */}
                {quote.lines?.map((line, i) => (
                  <p className="subjedit-note" key={i}>
                    {line.label}
                    <span className="muted"> · {line.value}</span>
                  </p>
                ))}
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
