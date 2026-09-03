"use client";

// The activate / deactivate control for ONE store product row.
//
// WHY A CONFIRMATION DIALOG AND NOT A SWITCH. Every other on/off control in
// this panel (FeatureFlagToggle, StickerThemeToggle) is one click, because the
// worst case is a screen that looks wrong until somebody clicks again. This one
// is different in kind: activating a product makes it PURCHASABLE in the iOS
// app, and if the matching product does not already exist and is not approved
// in App Store Connect, StoreKit cannot resolve it and the purchase fails for
// every family who taps Buy — an outcome no test on our side can reveal and no
// server flag can undo fast enough. The dialog exists to state that consequence
// in words before the click, and the acknowledgement checkbox exists because
// the App Store Connect half is a fact only the person clicking can confirm.
//
// Deactivation gets the same dialog with no checkbox: its consequence (the
// product disappears from the app and nobody can buy it) is real but safe, and
// it must never be harder than the dangerous direction.
//
// Every string arrives already translated from the server page — this component
// never touches the i18n layer, the same contract DestructiveConfirmDialog and
// LeaderboardResetControls use.
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import { setIapProductActive, type IapActionState } from "@/lib/admin/iap";

export type IapToggleStrings = {
  activate: string;
  deactivate: string;
  working: string;
  title: string;
  /** The plain consequence sentence for turning a product ON. */
  consequenceOn: string;
  /** …and for turning it OFF. */
  consequenceOff: string;
  ack: string;
  confirmOn: string;
  confirmOff: string;
  cancel: string;
  close: string;
  blockedTitle: string;
  /** Error KEY → localized sentence. The action returns keys, never prose. */
  errors: Record<string, string>;
  errFallback: string;
};

export function IapToggle({
  id,
  productId,
  grants,
  active,
  blockedReason,
  strings,
}: {
  id: string;
  productId: string;
  /** Human description of what the product sells, shown inside the dialog. */
  grants: string;
  active: boolean;
  /**
   * Already-localized reason this row cannot be activated (archived subject,
   * deleted package…), or null when it is sellable. Only ever blocks the ON
   * direction — see the file header.
   */
  blockedReason: string | null;
  strings: IapToggleStrings;
}) {
  const [state, formAction, pending] = useActionState<IapActionState, FormData>(
    setIapProductActive,
    null,
  );
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);

  const next = !active;
  const blocked = next && blockedReason !== null;

  // Close on success. The server action revalidates /iap, so the row behind the
  // dialog re-renders with the new state; leaving the dialog open would show a
  // confirm button for a change that has already happened.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const errorText = state?.error
    ? (strings.errors[state.error] ?? strings.errFallback)
    : null;

  return (
    <>
      <button
        type="button"
        className={active ? "link-button" : "btn btn-sm"}
        disabled={blocked}
        title={blocked ? (blockedReason ?? undefined) : undefined}
        onClick={() => {
          // The acknowledgement resets on every open: a checkbox still ticked
          // from the previous product is not a statement about this one.
          setAck(false);
          setOpen(true);
        }}
      >
        {active ? strings.deactivate : strings.activate}
      </button>

      {/* The refusal is printed next to the button that refused, not hidden in
          a tooltip — a disabled control with no stated reason reads as a bug. */}
      {blocked && (
        <span className="form-error" style={{ display: "block", marginTop: 4 }}>
          {blockedReason}
        </span>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={strings.title}
        closeLabel={strings.close}
        busy={pending}
      >
        <div className="form">
          <p style={{ marginBottom: 0 }}>
            <strong>{grants}</strong>
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            <code>{productId}</code>
          </p>

          <p className={next ? "form-error" : undefined}>
            {next ? strings.consequenceOn : strings.consequenceOff}
          </p>

          {next && (
            <label
              className="field"
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={ack}
                disabled={pending}
                onChange={(e) => setAck(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>{strings.ack}</span>
            </label>
          )}

          {blocked && (
            <div role="alert">
              <p className="form-error">{strings.blockedTitle}</p>
              <p className="form-error">{blockedReason}</p>
            </div>
          )}

          <form action={formAction} className="form">
            <input type="hidden" name="__id" value={id} />
            <input type="hidden" name="__active" value={String(next)} />
            <div className="row-actions" style={{ justifyContent: "flex-start" }}>
              <ActionButton
                // Both classes: `.btn-danger` sets only a background colour, so
                // without `.btn` it renders as a default system button and the
                // disabled dimming never applies — an ungated button and a
                // gated one would look identical.
                className={next ? "btn btn-danger" : "btn"}
                pending={pending}
                pendingLabel={strings.working}
                disabled={blocked || (next && !ack)}
              >
                {next ? strings.confirmOn : strings.confirmOff}
              </ActionButton>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {strings.cancel}
              </button>
            </div>
          </form>

          {errorText && (
            <span className="form-error" role="alert">
              {errorText}
            </span>
          )}
        </div>
      </Modal>
    </>
  );
}
