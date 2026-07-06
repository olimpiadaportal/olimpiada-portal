"use client";

// H8 — shared FREE activation callout (giveaway + free-access windows).
// While a free window is running, paid writes are blocked — so a child with NO
// live subscription and NO allocated 8-digit login ID used to be dead-ended on
// the subscribe page. This button calls the same server action the Add-Child
// wizard uses (activateChildGiveaway — the server re-verifies ownership AND
// that a giveaway/free-access window is actually live) to allocate and reveal
// the login ID at no cost. Strings arrive pre-translated via `dict`.

import { useActionState } from "react";
import {
  activateChildGiveaway,
  type GiveawayActivateState,
} from "@/lib/auth/subscriptionService";

export function FreeActivation({
  studentId,
  dict,
}: {
  studentId: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, formAction, pending] = useActionState<GiveawayActivateState, FormData>(
    activateChildGiveaway,
    null,
  );

  if (state?.ok) {
    return (
      <div className="card">
        <p>
          <strong>{tt("freeact.done")}</strong>
        </p>
        {state.childUniqueId && (
          <p>
            <span className="field-label">{tt("parent.child.idLabel")}</span>{" "}
            <code>{state.childUniqueId}</code>
          </p>
        )}
        <p className="muted">{tt("parent.child.idNote")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card">
      <input type="hidden" name="student_id" value={studentId} />
      <p className="muted">{tt("freeact.note")}</p>
      {state && !state.ok && state.error && (
        <p className="form-error">{state.error}</p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("freeact.activating") : tt("freeact.cta")}
      </button>
    </form>
  );
}
