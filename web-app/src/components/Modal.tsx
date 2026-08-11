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
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Round 50: FOCUS TRAP. `aria-modal` tells a screen reader the rest of the
      // page is inert, but it does not stop the browser tabbing into it — a
      // keyboard user could Tab straight out of an open dialog and interact with
      // the page behind the overlay. Cycle focus within the panel instead.
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      // Queried on each Tab, not cached: modal bodies are dynamic (a pending
      // button becomes disabled, rows appear) and a stale list would trap focus
      // on an element that no longer accepts it.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) {
        // Nothing tabbable inside — keep focus on the panel itself.
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !panel.contains(active)) {
        // Focus escaped (e.g. it was on the page before the dialog mounted).
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // MOBILE KEYBOARD, touch devices only. On a coarse pointer the modal's
    // scroll container is `.modal-overlay` (see globals.css), NOT the document
    // — the body is scroll-locked below. The browser's native "scroll the
    // focused field into view" therefore does not reach a field inside the
    // panel, so a low field (e.g. the CVC in DemoPaymentModal) stays under the
    // keyboard. Centring it inside the overlay also keeps its inline validation
    // message and the .modal-actions row clear of the keyboard.
    // Desktop matches `pointer: fine`, so this listener is never attached there
    // and desktop focus behaviour is exactly as before. Layout only — no
    // validation/submission behaviour is touched.
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    let scrollTimer = 0;
    function onFocusIn(e: FocusEvent) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (!panelRef.current?.contains(el)) return;
      const typeable =
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLInputElement &&
          !["hidden", "checkbox", "radio", "button", "submit", "reset"].includes(el.type));
      if (!typeable) return;
      // Wait for the keyboard animation so --kb-inset (and therefore the
      // overlay's usable height) is already up to date when we scroll.
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 280);
    }
    if (coarse) document.addEventListener("focusin", onFocusIn);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (coarse) document.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(scrollTimer);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null; // SSR guard

  // The portal lands in <body>, OUTSIDE .arena, so the child's palette tokens
  // never reached any dialog — under all 26 palettes the daily-round start, the
  // submit/cancel confirms, the image zoom and the notification detail stayed
  // purple/cream. Mirroring the attribute is enough: palettes.generated.css
  // declares the same token block for .modal-overlay[data-palette], and
  // globals.css maps those names onto the root tokens the modal chrome paints
  // from. Read during render rather than in an effect so the very first paint
  // is already correct — this branch is unreachable on the server (the SSR
  // guard above returns first), which is what makes reading the DOM here safe.
  const palette =
    document.querySelector(".arena")?.getAttribute("data-palette") ?? undefined;

  return createPortal(
    <div
      className="modal-overlay"
      data-palette={palette}
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
