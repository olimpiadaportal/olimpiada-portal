"use client";

// THE confirmation dialog for every guarded deletion (migration 111).
//
// One implementation, three callers (subject, olympiad package, olympiad grade
// pool) — and that is a correctness property, not tidiness. Each of these
// operations is either REFUSED for a set of counted reasons, or it destroys
// rows that no backup in this system can return. The screen that has to say so
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
//   - friction scales with blast radius: every branch requires the row's own
//     `code` typed out (the database demands it too, and re-checks it under a
//     lock), and a branch that empties a pool or a bank additionally requires an
//     acknowledgement checkbox — the LeaderboardResetControls precedent.
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
  blockedTitle: string;
  warnTitle: string;
  /** The plain statement that the action cannot be undone. Always rendered. */
  irreversible: string;
  codeLabel: string;
  codeHint: string;
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
}: {
  strings: DestructiveConfirmStrings;
  /** Side-effect-free preview server action. Returns null when it fails. */
  loadPreview: () => Promise<P | null>;
  /** The row's confirmation code, read out of the preview. */
  code: (preview: P) => string;
  /** The real counts, rendered by the caller from its own payload. */
  details: (preview: P) => ReactNode;
  /** The destructive branches. */
  children: (preview: P, gate: DestructiveGate) => ReactNode;
  /** Render the acknowledgement checkbox (any branch that empties a pool). */
  needsAck?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
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

  const expected = preview ? code(preview) : "";
  const codeOk = expected !== "" && typed === expected;

  const gate = useMemo<DestructiveGate>(
    () => ({ token: typed, codeOk, acknowledged: ack, busy, strings, setPending, refresh }),
    [typed, codeOk, ack, busy, strings, setPending, refresh],
  );

  return (
    <>
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

            {needsAck && (
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
  }, [state, refresh, router]);

  const blocked = blockedBy.length > 0;
  const ready = gate.codeOk && (!needsAck || gate.acknowledged);

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
          <p className="form-error">{gate.strings.blockedTitle}</p>
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
