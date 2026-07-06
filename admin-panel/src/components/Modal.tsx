"use client";

// Shared admin-panel modal primitive. Rendered via createPortal into <body>
// so it is immune to ancestor overflow/transform/stacking contexts.
//   - role="dialog" aria-modal, labelled by the title;
//   - Escape closes; clicking the overlay closes; × button — all three are
//     suppressed while `busy` (e.g. an upload in flight);
//   - body scroll locked while open; focus moves into the panel on open and
//     returns to the previously focused element on close;
//   - panel max-height with internal scroll; responsive on small screens.
// Styling contract (globals.css): .modal-overlay, .modal-panel(.wide),
// .modal-head, .modal-title, .modal-close, .modal-body — token-driven.
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeLabel = "Close",
  busy = false,
  wide = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  // Accessible label for the × button (pass a translated string).
  closeLabel?: string;
  // While true the modal cannot be dismissed (Esc/overlay/×) — protects
  // in-flight submissions.
  busy?: boolean;
  // Wider panel for large forms (e.g. the full question editor).
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // `busy` is read through a ref so toggling it never re-runs the open/close
  // effect (which would re-lock scroll and steal focus mid-interaction).
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Escape to close + focus management + body scroll lock.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) onClose();
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
        if (e.target === e.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={wide ? "modal-panel wide" : "modal-panel"}
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
            disabled={busy}
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
