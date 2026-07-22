// The app's single transient-feedback channel: one message at a time, shown
// from anywhere (hook or plain function) and auto-dismissed. The visual side
// lives in components/Toast.tsx, mounted once in the root layout.
import { create } from "zustand";

export type ToastTone = "ok" | "error";

/** Long enough to read a short sentence, short enough not to linger. */
const AUTO_HIDE_MS = 2200;

type ToastState = {
  /** Bumped on every show so repeating the SAME message replays the animation. */
  id: number;
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
};

// Module-level so a new toast always cancels the previous one's timer, whoever
// scheduled it.
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set, get) => ({
  id: 0,
  message: null,
  tone: "ok",
  show: (message, tone = "ok") => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ id: get().id + 1, message, tone });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set({ message: null });
    }, AUTO_HIDE_MS);
  },
  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    set({ message: null });
  },
}));

/** Imperative entry point for code paths that are not React components. */
export function showToast(message: string, tone: ToastTone = "ok"): void {
  useToastStore.getState().show(message, tone);
}
