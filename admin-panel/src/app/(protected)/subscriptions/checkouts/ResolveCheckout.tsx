"use client";

// ONE row's outcome box on the checkout-review queue.
//
// The only write on this page, and it is deliberately the smallest one that
// closes the loop: an operator types WHAT THEY DID and it is recorded. There is
// no "deliver it anyway" button and there must not be — delivering is
// `checkout_redeem_plan`'s job, behind a verified payment, and a button here
// that reached past it would be the exact defect migrations 125–127 exist to
// close.
//
// IT DOES NOT CHANGE THE STATUS, and the hint under the field says so out loud.
// `checkout_redemption_status` records what happened to the MONEY at redemption
// time; there are two values and neither means "a person settled it", so
// overwriting `needs_review` with `applied` would be a lie about a case that was
// refunded rather than delivered. The RPC writes `resolved:<sentence>` into the
// note instead, plus an audit row — and 013 checks 118 and 123 key on that
// prefix, which is what gives the alarm an off switch.
import { useActionState } from "react";
import {
  resolveCheckoutReview,
  type ResolveCheckoutState,
} from "@/lib/admin/checkouts";

export type ResolveCheckoutStrings = {
  placeholder: string;
  submit: string;
  submitting: string;
  hint: string;
};

export function ResolveCheckout({
  order,
  strings,
}: {
  order: string;
  strings: ResolveCheckoutStrings;
}) {
  const [state, action, pending] = useActionState<ResolveCheckoutState, FormData>(
    resolveCheckoutReview,
    null,
  );

  return (
    <form action={action} className="ckrev-resolve">
      <input type="hidden" name="order" value={order} />
      <input
        type="text"
        name="resolution"
        maxLength={180}
        required
        placeholder={strings.placeholder}
        aria-label={strings.placeholder}
        disabled={pending}
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? strings.submitting : strings.submit}
      </button>
      <p className="muted">{strings.hint}</p>
      {state?.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}
