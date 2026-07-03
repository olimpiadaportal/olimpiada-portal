"use client";

// Shared modal primitive (Round 9, T5). Every modal in the web-app renders
// through this component so behavior is consistent:
//   - rendered via createPortal into <body> (immune to ancestor overflow/
//     transform/stacking contexts — the root cause of the buggy olympiad
//     "Ətraflı" modal that rendered inside a card);
//   - dark overlay; clicking the overlay closes; Escape closes; × button;
//   - body scroll locked while open;
//   - role="dialog" aria-modal, labelled by the title, focus moves into the
//     panel on open and returns to the previously focused element on close.
// Styling contract (globals.css): .modal-overlay, .modal-panel, .modal-head,
// .modal-title, .modal-close, .modal-body — token-driven (light/dark/arena).
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeLabel = "Close",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  // Accessible label for the × button (pass a translated string).
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Escape to close + focus management + body scroll lock.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null; // SSR guard

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        // Close only on a true overlay press (not bubbled from the panel).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {title ? (
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="modal-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// Small confirmation helper on top of Modal — replaces browser confirm()
// dialogs (delete child / delete account) so destructive confirmations look
// and behave like every other modal. All strings arrive translated.
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  closeLabel,
  danger = true,
  pending = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} closeLabel={closeLabel ?? cancelLabel}>
      <p className="modal-message">{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "btn-danger" : "btn"}
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
