"use client";

// Minimal toast stack for the Curriculum Structure screen.
//
// The admin panel had NO toast primitive before this screen (grepped: zero
// hits) — every other module reports success by navigating or by re-rendering
// a list. The curriculum tree stays in place after a save/delete, so a
// transient confirmation is the only signal the admin gets; hence this.
//
// Kept ROUTE-LOCAL on purpose: it is small, has no dependencies and no other
// module consumes it yet. Promote it to src/components/ the moment a second
// screen needs toasts — do not fork a copy.
//
// Accessibility: the stack is an aria-live region (polite for success, assertive
// for errors), each toast is dismissible, and auto-dismiss is paused while the
// pointer is over the stack so a message cannot vanish mid-read.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ToastKind = "success" | "error";
export type Toast = { id: number; kind: ToastKind; text: string };

const AUTO_DISMISS_MS = 4500;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    // Cap the stack so a burst of actions cannot cover the screen.
    setToasts((list) => [...list.slice(-2), { id, kind, text }]);
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  onDismiss,
  dismissLabel,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  dismissLabel: string;
}) {
  const [paused, setPaused] = useState(false);

  // One timer per toast; cleared on unmount/dismiss. Pausing (pointer over the
  // stack) simply skips scheduling until the pointer leaves.
  useEffect(() => {
    if (paused || toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => onDismiss(t.id), AUTO_DISMISS_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, paused, onDismiss]);

  if (typeof document === "undefined") return null; // SSR guard

  return createPortal(
    <div
      className="cur-toasts"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`cur-toast cur-toast-${t.kind}`}
          role={t.kind === "error" ? "alert" : "status"}
          aria-live={t.kind === "error" ? "assertive" : "polite"}
        >
          <span className="cur-toast-text">{t.text}</span>
          <button
            type="button"
            className="cur-toast-close"
            aria-label={dismissLabel}
            title={dismissLabel}
            onClick={() => onDismiss(t.id)}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
