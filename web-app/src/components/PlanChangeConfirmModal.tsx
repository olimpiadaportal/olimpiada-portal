"use client";

// Payment confirmation sheet for subject ADDITIONS (Round 11; rebuilt 2026-08-18
// when the demo payment mode was deleted).
//
// It replaces the old DemoPaymentModal, which showed a DEMO badge, a "no card
// is ever charged" line and four cosmetic card fields. Those are gone: with the
// demo mode removed there is nothing to disclaim, and a card form that looks
// real but is not is worse than none — a parent could type a real PAN into it.
// What survives is the half that was always real: the AUTHORITATIVE server
// quote and an explicit confirm step before any paid change is applied.
//
// PAYMENT-FIRST contract: whenever the pending Manage-Subjects diff contains
// ANY addition, this sheet opens BEFORE the server apply. When the ABB/web
// provider lands it takes over at this exact seam (confirm → hosted payment
// page); the actual charge/authorization stays SERVER-side
// (updateSubscriptionSubjectsAction → apply_plan_change). Removal-only,
// cycle-change-only and reinstatement-only diffs never show this dialog.
//
// `quote` carries only ALREADY-FORMATTED, locale-aware strings built by the
// caller (ManageSubjects) from the AUTHORITATIVE server quote
// (quote_plan_change: the due-now total plus, per added subject, its cycle,
// price and start) — the client never computes or sends amounts. Confirm runs
// the provided onConfirm callback (submits the server action); cancel/close
// applies NOTHING — the parent's selection stays for a retry.
import { Modal } from "@/components/Modal";

export type PlanChangeQuote = {
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

export function PlanChangeConfirmModal({
  isOpen,
  quote,
  pending,
  onConfirm,
  onCancel,
  dict,
}: {
  isOpen: boolean;
  /** Latest AUTHORITATIVE server quote for the pending diff; null while calculating. */
  quote: PlanChangeQuote | null;
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
      closeLabel={tt("pay.cancel")}
    >
      {/* Reuses the Add-Child wizard's .pay-* look; .pcsheet-card drops the outer
          card frame so it sits cleanly inside the shared modal panel. */}
      <div className="pay-card pcsheet-card">
        {/* The amount due NOW (the added subjects' full first periods, never a
            part period and never the whole plan's recurring total), the
            sentence explaining what it buys, and one row per subject being paid
            for — all pre-formatted from the authoritative quote_plan_change
            quote, never computed client-side. */}
        <div className="wizard-summary pcsheet-total">
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
            {tt("pay.cancel")}
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
