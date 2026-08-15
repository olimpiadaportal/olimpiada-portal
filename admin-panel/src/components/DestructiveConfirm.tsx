"use client";

// THE confirmation dialog for every guarded deletion (migration 111).
//
// One implementation, four callers (subject; olympiad package, from both the
// package list and the package edit page; olympiad grade pool; and a selection
// of pool questions) — and that is a correctness property, not tidiness. Each of
// these operations is either REFUSED for a set of counted reasons, or it
// destroys rows that no backup in this system can return. The screen that says so
// must say it the same way every time: the same place for the blocks, the same
// place for the irreversible warning, the same friction. A second dialog is a
// second chance to forget one of them.
//
// WHAT IT GUARANTEES
//   - the counts come from the preview RPC and are re-fetched on open AND after
//     every mutation, so the numbers on screen are never a stale argument for
//     the click that follows them;
//   - the blocking reasons are rendered as finished sentences that each name a
//     reason and an alternative — a blocked action is never a bare failure;
//   - "this cannot be undone" is always on screen, not implied by a red button;
//   - friction scales with blast radius: a branch that names ONE row requires
//     that row's own `code` typed out (the database demands it too, and
//     re-checks it under a lock), and a branch that empties a pool or a bank
//     additionally requires an acknowledgement checkbox — the
//     LeaderboardResetControls precedent. Friction never reaches zero: a dialog
//     opened without a `code` (see below) has the checkbox forced on.
//
// THE TOKEN-FREE MODE. `code` is optional, and a dialog opened without one gets
// the acknowledgement checkbox forced on. It is a SAFE DEFAULT, not a design
// anybody should reach for: every caller in the panel passes a `code` today,
// including the olympiad pool's bulk delete, because the argument that a
// selection "names its own targets" does not survive the way these RPCs are
// reachable. They are granted to `authenticated`, so each one is a PostgREST
// endpoint an admin session can POST directly with an id list of its own
// choosing — the dialog is not a control, and only a value the DATABASE
// re-checks (admin_delete_olympiad_questions.p_expected_code, compared under
// the package's row lock) is. The mode stays because a future caller that
// genuinely has no row code must still meet some friction rather than none.
//
// The strings arrive already translated from the server page (same contract as
// LeaderboardResetControls): this component never calls the i18n layer.
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import type { DestructiveState } from "@/lib/admin/deletion-hints";

export type DestructiveConfirmStrings = {
  /** Label of the button that opens the dialog. */
  open: string;
  title: string;
  loading: string;
  loadFailed: string;
  /**
   * Heading above a branch's PRE-COMPUTED blocking reasons. Only dialogs whose
   * preview RPC reports blocks up front pass it; the bulk pool delete has no
   * preview (the delete/archive split is decided inside the delete itself), so
   * its refusals arrive with the action result and carry their own heading.
   */
  blockedTitle?: string;
  warnTitle: string;
  /** The plain statement that the action cannot be undone. Always rendered. */
  irreversible: string;
  /** Required whenever the dialog is given a `code`; unused without one. */
  codeLabel?: string;
  codeHint?: string;
  ackLabel: string;
  cancel: string;
  close: string;
  working: string;
};

/** Shared confirmation state handed to every branch inside the dialog. */
export type DestructiveGate = {
  /** What the admin typed. Posted as `__code`; the DATABASE compares it. */
  token: string;
  /** Token equals the row's code. UX only — the RPC re-checks under lock. */
  codeOk: boolean;
  acknowledged: boolean;
  /**
   * The dialog runs without a typed token, so EVERY branch inside it needs the
   * checkbox regardless of its own `needsAck`. Carried on the gate rather than
   * left to each call site: a branch that forgot the flag would otherwise ship
   * a one-click destructive button.
   */
  ackRequired: boolean;
  /** Any branch in flight: locks the modal and every other button. */
  busy: boolean;
  strings: DestructiveConfirmStrings;
  setPending: (key: string, pending: boolean) => void;
  /** Re-runs the preview so the counts describe the CURRENT state. */
  refresh: () => void;
};

export function DestructiveConfirmDialog<P>({
  strings,
  loadPreview,
  code,
  details,
  children,
  needsAck = false,
  triggerClassName = "link-danger",
  open: openProp,
  onOpenChange,
}: {
  strings: DestructiveConfirmStrings;
  /** Side-effect-free preview server action. Returns null when it fails. */
  loadPreview: () => Promise<P | null>;
  /**
   * The row's confirmation code, read out of the preview. OMIT IT for a
   * selection the admin assembled themselves — see THE TOKEN-FREE MODE in the
   * file header; the acknowledgement checkbox is then forced on.
   */
  code?: (preview: P) => string;
  /** The real counts, rendered by the caller from its own payload. */
  details: (preview: P) => ReactNode;
  /** The destructive branches. */
  children: (preview: P, gate: DestructiveGate) => ReactNode;
  /** Render the acknowledgement checkbox (any branch that empties a pool). */
  needsAck?: boolean;
  triggerClassName?: string;
  /**
   * CONTROLLED MODE. Passing `open` hands the dialog's visibility to the
   * caller and suppresses the built-in trigger button.
   *
   * It exists for a specific failure it prevents. A dialog rendered INSIDE the
   * thing it deletes — a package list row, a toolbar that only appears while
   * rows are selected — is unmounted by its own success: the server action
   * revalidates the page, the row (or the toolbar) goes, and the result message
   * goes with it, so the admin is told nothing about the operation that just
   * ran. Mounting the ONE dialog above that boundary and opening it from a row
   * button is what makes the outcome survive long enough to be read. Same
   * one-modal-serves-every-row shape EditQuestionModal already uses.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : selfOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setSelfOpen(next);
    onOpenChange?.(next);
  };
  const [preview, setPreview] = useState<P | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});

  const busy = Object.values(pendingKeys).some(Boolean);

  // Stable identities: the branch components report their pending flag and
  // their success from effects, and a callback that changed every render would
  // turn either into an infinite loop.
  const setPending = useCallback((key: string, pending: boolean) => {
    setPendingKeys((prev) =>
      prev[key] === pending ? prev : { ...prev, [key]: pending },
    );
  }, []);
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Re-fetched on every open AND after every mutation, never cached across
  // them: the counts ARE the argument for the click, and a stale preview would
  // describe a row somebody else has since edited — or the pool this dialog
  // just emptied.
  useEffect(() => {
    if (!open) return;
    setLoadFailed(false);
    startLoading(async () => {
      const p = await loadPreview();
      if (p) setPreview(p);
      else setLoadFailed(true);
    });
    // loadPreview is a server-action reference recreated on every render of the
    // parent; depending on it would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  const expected = preview && code ? code(preview) : "";
  // No `code` prop = no token to satisfy, so this gate is open and the
  // acknowledgement below carries the whole confirmation.
  const codeOk = code ? expected !== "" && typed === expected : true;
  const ackRequired = needsAck || !code;

  const gate = useMemo<DestructiveGate>(
    () => ({
      token: typed,
      codeOk,
      acknowledged: ack,
      ackRequired,
      busy,
      strings,
      setPending,
      refresh,
    }),
    [typed, codeOk, ack, ackRequired, busy, strings, setPending, refresh],
  );

  return (
    <>
      {/* Controlled mode brings its own trigger — see the `open` prop. */}
      {!controlled && (
        <button
          type="button"
          className={triggerClassName}
          onClick={() => {
            // Both frictions reset on every open: a token still sitting in the
            // box from the previous package is not a confirmation of this one.
            setTyped("");
            setAck(false);
            setOpen(true);
          }}
        >
          {strings.open}
        </button>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={strings.title}
        closeLabel={strings.close}
        busy={busy}
      >
        {loading && !preview && <p className="muted">{strings.loading}</p>}
        {loadFailed && !preview && (
          <p className="form-error" role="alert">
            {strings.loadFailed}
          </p>
        )}

        {preview && (
          <div className="form">
            {details(preview)}

            <p className="form-error" role="alert" style={{ fontWeight: 600 }}>
              {strings.irreversible}
            </p>

            {/* The token, shown AND required. `code` is auto-generated and is
                not an input anywhere else, so it cannot be typed from memory —
                which is exactly the property that makes it a confirmation, and
                what makes a two-tabs-open mix-up impossible to commit. */}
            {code && (
              <label className="field">
                <span className="field-label">{strings.codeLabel}</span>
                <input
                  type="text"
                  value={typed}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  onChange={(e) => setTyped(e.target.value)}
                />
                <small className="muted">
                  {strings.codeHint} <code>{expected}</code>
                </small>
              </label>
            )}

            {ackRequired && (
              <label
                className="field"
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy}
                  onChange={(e) => setAck(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>{strings.ackLabel}</span>
              </label>
            )}

            {children(preview, gate)}

            <div className="row-actions" style={{ justifyContent: "flex-start" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {strings.cancel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * ONE destructive branch inside the dialog: its own title, its own explanation
 * of what that specific branch destroys, its own blocking reasons and its own
 * result. A branch is a separate component (not a loop in the dialog) because
 * each owns a useActionState — and a hook count that changes with the number of
 * branches is not a hook count.
 */
export function DestructiveActionForm({
  gate,
  actionKey,
  action,
  fields,
  title,
  description,
  label,
  blockedBy = [],
  needsAck = false,
  disabled = false,
  onSuccess,
}: {
  gate: DestructiveGate;
  /** Stable key identifying this branch in the dialog's pending map. */
  actionKey: string;
  action: (prev: DestructiveState, fd: FormData) => Promise<DestructiveState>;
  /** Hidden inputs (ids, flags). `__code` is added from the gate. */
  fields: Record<string, string>;
  title: string;
  description: string;
  label: string;
  /** Why this branch specifically cannot run — already localized sentences. */
  blockedBy?: string[];
  /** This branch empties a pool or a bank: require the checkbox too. */
  needsAck?: boolean;
  disabled?: boolean;
  /**
   * Replaces the default "follow `redirectTo`, otherwise re-read the preview"
   * when this branch succeeds. Pass it when the dialog lives on a page that
   * SURVIVES the mutation — a list row, or a toolbar over a table. Both
   * defaults are wrong there: navigating would throw away the admin's filters,
   * and re-reading a preview of a row that no longer exists renders nothing but
   * "load failed".
   *
   * MUST be referentially stable (useCallback): it runs from an effect whose
   * dependency list contains it.
   */
  onSuccess?: (state: { ok: true; message: string; redirectTo?: string }) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DestructiveState, FormData>(
    action,
    null,
  );
  const { setPending, refresh } = gate;

  useEffect(() => {
    setPending(actionKey, pending);
  }, [actionKey, pending, setPending]);

  useEffect(() => {
    if (!state?.ok) return;
    // The caller owns what happens next — see the prop's doc comment.
    if (onSuccess) {
      onSuccess(state);
      return;
    }
    // The page this dialog sits on describes a row that no longer exists, so
    // staying would leave the admin on a 404-in-waiting. The target is a fixed
    // literal chosen by the server action — never a value from the client.
    if (state.redirectTo) {
      router.replace(state.redirectTo);
      return;
    }
    // Otherwise re-read the counts: the second branch must not be offered on
    // the numbers that were true before the first one ran.
    refresh();
  }, [state, refresh, router, onSuccess]);

  const blocked = blockedBy.length > 0;
  // gate.ackRequired is the dialog-wide floor (a token-free dialog), needsAck
  // this branch's own extra demand — either one arms the checkbox.
  const mustAck = needsAck || gate.ackRequired;
  const ready = gate.codeOk && (!mustAck || gate.acknowledged);

  return (
    <form action={formAction} className="form">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="__code" value={gate.token} />

      <p style={{ marginBottom: 0 }}>
        <strong>{title}</strong>
      </p>
      <p className="muted" style={{ marginTop: 4 }}>
        {description}
      </p>

      {blocked && (
        <div role="alert">
          {gate.strings.blockedTitle && (
            <p className="form-error">{gate.strings.blockedTitle}</p>
          )}
          <ul>
            {blockedBy.map((b, i) => (
              <li key={i} className="form-error">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <ActionButton
          className="btn-danger"
          pending={pending}
          pendingLabel={gate.strings.working}
          disabled={!ready || blocked || disabled || gate.busy}
        >
          {label}
        </ActionButton>
      </div>

      {state && !state.ok && (
        <div role="alert">
          <span className="form-error">{state.error}</span>
          <ul>
            {state.blocks.map((b, i) => (
              <li key={i} className="form-error">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state && state.ok && (
        <span className="form-ok" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
