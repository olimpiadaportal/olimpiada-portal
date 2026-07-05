"use client";

// Round 11 (item 1) — Manage-Subjects CHECKBOX editor for an existing child's
// live subscription. The parent sees ALL subjects as checkboxes: the child's
// CURRENT/ACTIVE subjects pre-checked (accent treatment + "Aktiv" chip) and
// the ADDITIONAL available subjects unchecked, each with its price for the
// subscription's interval. A live summary shows the selected count, pending
// additions/removals and a debounced server quote (authoritative sibling-
// discount pricing — never computed client-side).
//
// PAYMENT-FIRST contract (owner requirement): toggling checkboxes is PURE
// client state — nothing is applied until the parent confirms. If the pending
// diff contains ANY addition (including mixed add+remove diffs), Save first
// opens the payment sheet (DemoPaymentModal) in BOTH 'demo' AND 'real' modes —
// there is no provider yet; the real-provider seam is server-side and will
// replace the sheet for 'real' mode when it lands. Only the sheet's explicit
// confirm submits updateSubscriptionSubjectsAction (THE single apply step);
// cancel/close applies nothing and keeps the selection for a retry.
// Removal-only diffs skip payment and submit directly (the remove RPC
// re-prices server-side at the kept sibling-discount rate).
//
// The SERVER diffs the posted DESIRED FULL set against the live subscription
// and applies via the re-pricing RPCs — ownership recheck, payment-mode gate
// ('off'/'giveaway' rejected) and all amounts are server-side; the client
// never sends prices.
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  quoteSubscription,
  updateSubscriptionSubjectsAction,
  type QuoteResult,
  type SubjectsUpdateState,
} from "@/lib/auth/subscriptionService";
import { DemoPaymentModal } from "@/components/DemoPaymentModal";

type Subj = { id: string; name: string; prices: Record<string, number> };

const INTERVAL_KEY: Record<string, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

export function ManageSubjects({
  studentId,
  subjects,
  coveredIds,
  interval,
  paymentMode,
  dict,
}: {
  studentId: string;
  subjects: Subj[];
  coveredIds: string[];
  /** The live subscription's billing interval ("week" | "month" | "year"). */
  interval: string;
  /** Server-resolved payment mode; the page renders this editor only for "real" | "demo". */
  paymentMode: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const intervalLabel = tt(INTERVAL_KEY[interval] ?? "pricing.monthly");

  const covered = useMemo(() => new Set(coveredIds), [coveredIds]);
  const coveredKey = useMemo(() => [...coveredIds].sort().join(","), [coveredIds]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(coveredIds));
  // After a successful save the server revalidates the page and coveredIds
  // changes — resync so the checkboxes/summary reset to the new live coverage.
  useEffect(() => {
    setSelected(new Set(coveredKey ? coveredKey.split(",") : []));
  }, [coveredKey]);

  const selectedKey = useMemo(() => [...selected].sort().join(","), [selected]);
  const toAdd = subjects.filter((s) => selected.has(s.id) && !covered.has(s.id));
  const toRemove = subjects.filter((s) => !selected.has(s.id) && covered.has(s.id));
  const hasDiff = toAdd.length > 0 || toRemove.length > 0;

  // Debounced (~400ms) AUTHORITATIVE price preview for the selected set.
  // Only base/discount/total are displayed (the quote's trial fields relate to
  // launch config, not to editing an existing subscription).
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const seqRef = useRef(0);
  useEffect(() => {
    const ids = selectedKey ? selectedKey.split(",") : [];
    if (ids.length === 0) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    const seq = ++seqRef.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      quoteSubscription({ studentId, interval, subjectIds: ids })
        .then((q) => {
          if (seqRef.current !== seq) return; // stale response — ignore
          setQuote(q);
          setQuoting(false);
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setQuote(null);
          setQuoting(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [selectedKey, studentId, interval]);

  const [state, formAction, saving] = useActionState<SubjectsUpdateState, FormData>(
    updateSubscriptionSubjectsAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [payOpen, setPayOpen] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev; // ≥1 subject must remain (server enforces too)
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function onSaveClick() {
    if (!hasDiff || saving) return;
    // PAYMENT-FIRST: any ADDITION (also in mixed add+remove diffs) opens the
    // payment sheet before the apply — in BOTH 'demo' and 'real' modes (no
    // provider yet; the real charge seam is server-side and will replace the
    // sheet for 'real' when it lands). One confirm covers the whole change.
    if (toAdd.length > 0) {
      setPayOpen(true);
      return;
    }
    // Removal-only diff: no payment step — the server re-prices on remove.
    formRef.current?.requestSubmit();
  }

  const showSaved = state?.ok === true && !hasDiff && !saving;

  return (
    <div className="form" style={{ maxWidth: 560 }}>
      <h2 style={{ marginBottom: 4 }}>{tt("subjedit.title")}</h2>
      <p className="subjedit-note">{tt("pricing.perSubjectNote")}</p>

      {subjects.length === 0 ? (
        <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
      ) : (
        <>
          {/* ALL subjects as checkboxes: active ones pre-checked + chip. */}
          <ul className="subjedit-list">
            {subjects.map((s) => {
              const isActive = covered.has(s.id);
              const isChecked = selected.has(s.id);
              const isLastOne = isChecked && selected.size <= 1;
              const price = s.prices[interval];
              return (
                <li key={s.id}>
                  <label
                    className={`subjedit-item${isActive ? " is-active" : ""}${
                      isChecked ? " is-checked" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(s.id)}
                      disabled={saving || isLastOne}
                      title={isLastOne ? tt("subjedit.minOne") : undefined}
                    />
                    <span className="subjedit-name">{s.name}</span>
                    {isActive && (
                      <span className="subjedit-chip-active">{tt("subjedit.activeChip")}</span>
                    )}
                    <span className="subjedit-price">
                      {price != null ? `${price} AZN / ${intervalLabel}` : "—"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="hint">{tt("subjedit.minOne")}</p>

          {/* Live summary: count, pending diff chips, server-quoted total. */}
          <div className="wizard-summary">
            <div className="quote-row">
              <span className="q-label">{tt("subjedit.selectedCount")}</span>
              <span>{selected.size}</span>
            </div>

            {toAdd.length > 0 && (
              <div className="subjedit-pending">
                <span className="subjedit-pending-label">{tt("subjedit.pendingAdd")}:</span>
                {toAdd.map((s) => (
                  <span key={s.id} className="subjedit-chip add">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
            {toRemove.length > 0 && (
              <div className="subjedit-pending">
                <span className="subjedit-pending-label">{tt("subjedit.pendingRemove")}:</span>
                {toRemove.map((s) => (
                  <span key={s.id} className="subjedit-chip remove">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            {quoting ? (
              <div className="quote-row">
                <span className="q-label">{tt("subjedit.estTotal")}</span>
                <span>{tt("sub.calculating")}</span>
              </div>
            ) : quote && quote.ok ? (
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
                    {quote.discount_percent > 0
                      ? `−${quote.discount_percent}% (−${quote.discount} ${quote.currency})`
                      : "0%"}
                  </span>
                </div>
                <div className="quote-total">
                  <span>{tt("subjedit.estTotal")}</span>
                  <span>
                    {quote.total} {quote.currency} / {intervalLabel}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {/* Hidden form: student_id + one `subject` entry per DESIRED subject.
              The server diffs against the live subscription and re-prices. */}
          <form action={formAction} ref={formRef}>
            <input type="hidden" name="student_id" value={studentId} />
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="subject" value={id} />
            ))}
            <div className="subjedit-actions">
              <button
                type="button"
                className="btn"
                onClick={onSaveClick}
                disabled={!hasDiff || saving}
                title={!hasDiff ? tt("subjedit.noChanges") : undefined}
              >
                {saving ? tt("subjedit.saving") : tt("subjedit.save")}
              </button>
              {paymentMode === "demo" && (
                <p className="subjedit-mode-note">{tt("subjedit.demoModeNote")}</p>
              )}
            </div>
          </form>

          {state && state.ok === false && <p className="form-error">{state.error}</p>}
          {showSaved && <p className="subjedit-success">{tt("subjedit.saved")}</p>}

          {/* Payment-first sheet for additions ('demo' AND 'real' — no provider
              yet). Confirm is the ONLY path that submits the apply action;
              cancel/close keeps the selection and applies nothing. */}
          <DemoPaymentModal
            isOpen={payOpen}
            quote={
              !quoting && quote && quote.ok
                ? {
                    base: quote.base,
                    discountPercent: quote.discount_percent,
                    discount: quote.discount,
                    total: quote.total,
                    currency: quote.currency,
                  }
                : null
            }
            intervalLabel={intervalLabel}
            pending={saving}
            onConfirm={() => {
              setPayOpen(false);
              formRef.current?.requestSubmit();
            }}
            onCancel={() => setPayOpen(false)}
            dict={dict}
          />
        </>
      )}
    </div>
  );
}
