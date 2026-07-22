"use client";

// Lifecycle action buttons for ONE subscription row/detail: Activate / Extend
// (+days) / Cancel / Expire. Only the actions the DB transition rules allow
// for the CURRENT status are ever rendered (computed server-side via
// allowedSubscriptionActions and passed in as `allowed`) — the RPC itself is
// still the enforced authority, this is just the honest UI reflection of it.
//
// Every action is a destructive/entitlement-changing change, so each opens a
// confirm Modal before submitting (mirrors LeaderboardResetControls). Extend
// additionally collects a days input (1..730, re-validated server-side).
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  manageSubscription,
  type ManageSubscriptionState,
} from "@/lib/admin/subscriptions";
import type { SubscriptionAction } from "@/lib/admin/subscription-lifecycle";

export type SubscriptionActionStrings = {
  button: Record<SubscriptionAction, string>;
  title: Record<SubscriptionAction, string>;
  body: Record<SubscriptionAction, string>;
  confirm: Record<SubscriptionAction, string>;
  done: Record<SubscriptionAction, string>;
  daysLabel: string;
  daysHint: string;
  cancelBtn: string;
  closeBtn: string;
  submitting: string;
};

const WARN_ACTIONS = new Set<SubscriptionAction>(["cancel", "expire"]);

export function SubscriptionActions({
  subscriptionId,
  allowed,
  strings,
}: {
  subscriptionId: string;
  allowed: SubscriptionAction[];
  strings: SubscriptionActionStrings;
}) {
  const [state, action, pending] = useActionState<
    ManageSubscriptionState,
    FormData
  >(manageSubscription, null);

  const [open, setOpen] = useState<SubscriptionAction | null>(null);
  const [days, setDays] = useState("30");
  const [done, setDone] = useState<SubscriptionAction | null>(null);

  // Close the dialog + show a transient success line once the action
  // succeeds (revalidatePath already refreshed the server-rendered data).
  useEffect(() => {
    if (state?.ok && open) {
      setDone(open);
      setOpen(null);
      const timer = setTimeout(() => setDone(null), 6000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (allowed.length === 0) return null;

  const errorText = state?.error && !state.ok ? state.error : null;

  return (
    <div className="row-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
      {allowed.map((a) => (
        <button
          key={a}
          type="button"
          className={WARN_ACTIONS.has(a) ? "btn-warn btn-sm" : "btn btn-sm"}
          onClick={() => {
            setDays("30");
            setOpen(a);
          }}
          disabled={pending}
        >
          {strings.button[a]}
        </button>
      ))}

      {done && (
        <span className="inline-status ok" role="status">
          {strings.done[done]}
        </span>
      )}
      {!open && errorText && (
        <span className="inline-status err" role="alert">
          {errorText}
        </span>
      )}

      {allowed.map((a) => (
        <Modal
          key={a}
          isOpen={open === a}
          onClose={() => setOpen(null)}
          title={strings.title[a]}
          closeLabel={strings.closeBtn}
          busy={pending}
        >
          <form action={action} className="form">
            <input type="hidden" name="subscription_id" value={subscriptionId} />
            <input type="hidden" name="action" value={a} />
            <p className="muted" style={{ marginTop: 0 }}>
              {strings.body[a]}
            </p>
            {a === "extend" && (
              <label className="field">
                <span>{strings.daysLabel}</span>
                <input
                  type="number"
                  name="days"
                  min={1}
                  max={730}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  disabled={pending}
                />
                <small className="muted">{strings.daysHint}</small>
              </label>
            )}
            {errorText && (
              <span className="form-error" role="alert">
                {errorText}
              </span>
            )}
            <div className="row-actions" style={{ justifyContent: "flex-start" }}>
              <button
                type="submit"
                className={WARN_ACTIONS.has(a) ? "btn-warn" : "btn"}
                disabled={pending}
              >
                {pending ? strings.submitting : strings.confirm[a]}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOpen(null)}
                disabled={pending}
              >
                {strings.cancelBtn}
              </button>
            </div>
          </form>
        </Modal>
      ))}
    </div>
  );
}
