"use client";

// W2 — parent-initiated cancel flow, R9 (T5): now rendered through the shared
// <Modal/> (portal, overlay click, Escape, ×, scroll lock) with two steps:
//   step 1: pick a reason (why are you cancelling?) + see what the child loses.
//   step 2: confirm the danger action (server cancelChildSubscription) or keep.
// On success we show cancel.done and refresh so the SaaS card re-renders with the
// updated status. All copy is passed in via `strings` so this component never
// touches messages.ts and never renders a raw key.
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import {
  cancelChildSubscription,
  type CancelSubscriptionState,
} from "@/lib/auth/subscriptionService";

const REASON_KEYS = [
  "cancel.reason.price",
  "cancel.reason.notUsing",
  "cancel.reason.features",
  "cancel.reason.temporary",
  "cancel.reason.other",
] as const;

export function CancelSubscription({
  studentProfileId,
  subscriptionId,
  childName,
  strings,
}: {
  studentProfileId: string;
  subscriptionId: string;
  childName: string;
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<string>("");
  const [state, formAction, pending] = useActionState<CancelSubscriptionState, FormData>(
    cancelChildSubscription,
    null,
  );

  const close = () => {
    setOpen(false);
    setStep(1);
    setReason("");
  };

  // On successful cancel, refresh so the parent card shows the new status.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  return (
    <>
      <button type="button" className="btn-danger" onClick={() => setOpen(true)}>
        {s("subscription.cancelBtn")}
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title={`${s("cancel.title")} — ${childName}`}
        closeLabel={s("cancel.keep")}
      >
        <div>
            {state?.ok ? (
              <div className="cm-step">
                <h3>{s("cancel.done")}</h3>
                <div className="cm-actions">
                  <button type="button" className="btn" onClick={close}>
                    {s("cancel.keep")}
                  </button>
                </div>
              </div>
            ) : step === 1 ? (
              <div className="cm-step">
                <p className="muted">{s("cancel.intro")}</p>

                <span className="field-label">{s("cancel.reasonLabel")}</span>
                <div className="cm-reasons">
                  {REASON_KEYS.map((rk) => (
                    <button
                      key={rk}
                      type="button"
                      className={`cm-reason${reason === rk ? " active" : ""}`}
                      aria-pressed={reason === rk}
                      onClick={() => setReason(rk)}
                    >
                      {s(rk)}
                    </button>
                  ))}
                </div>

                <p className="field-label" style={{ marginTop: 16 }}>
                  {s("cancel.benefitsTitle")}
                </p>
                <ul className="cm-benefits">
                  <li className="cm-benefit">{s("cancel.benefit1")}</li>
                  <li className="cm-benefit">{s("cancel.benefit2")}</li>
                  <li className="cm-benefit">{s("cancel.benefit3")}</li>
                </ul>

                <div className="cm-actions">
                  <button type="button" className="btn" onClick={close}>
                    {s("cancel.keep")}
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!reason}
                    onClick={() => setStep(2)}
                  >
                    {s("subscription.cancelBtn")}
                  </button>
                </div>
              </div>
            ) : (
              <form action={formAction} className="cm-step">
                <input type="hidden" name="student_id" value={studentProfileId} />
                <input type="hidden" name="subscription_id" value={subscriptionId} />
                <input type="hidden" name="reason" value={reason} />

                <p className="muted">{s("cancel.intro")}</p>

                {state?.error && <p className="form-error">{state.error}</p>}

                <div className="cm-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={close}
                    disabled={pending}
                  >
                    {s("cancel.keep")}
                  </button>
                  <button type="submit" className="btn-danger" disabled={pending}>
                    {s("cancel.confirm")}
                  </button>
                </div>
              </form>
            )}
        </div>
      </Modal>
    </>
  );
}
