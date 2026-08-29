"use client";

// The child's 8-digit login ID, clickable to copy. Web twin of
// mobile-app/src/components/CopyableId.tsx; same behaviour, same reasoning.
//
// WHY A COMPONENT RATHER THAN AN onClick AT EACH SITE. The ID is rendered in
// five places — the dashboard child card, the Add-Child success reveal, the
// subscribe success screen, the free-activation callout and the child-info
// editor — and a parent reads it from whichever one they happen to be on.
// Five copies of "copy, then confirm, then reset" is five chances for one of
// them to drift into not confirming, which is the failure that matters: a
// silent copy is indistinguishable from a click that missed.
//
// WHAT IT COPIES. The RAW digits, never the grouped display form.
// `groupChildId` inserts a space for readability ("2721 0253"); pasting that
// into the login field would fail, and the parent would blame the ID rather
// than the space.
//
// TRANSLATION. Internal, via useT() (the provider is mounted in
// src/app/layout.tsx), so no call site has to thread a dict through — three of
// the five sites are server components that would otherwise need new key lists.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { groupChildId } from "@/lib/childId";

/**
 * Puts the RAW digits on the clipboard. Returns false when the write was
 * refused, in which case `fallbackEl`'s text is selected instead.
 *
 * Exported for the spec: the raw-vs-grouped distinction is the whole point of
 * this component and is worth an assertion that does not depend on a DOM.
 */
export async function copyRawId(
  id: string,
  fallbackEl: HTMLElement | null,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(id);
    return true;
  } catch {
    // http:// origins and older browsers have no clipboard API, and a user can
    // deny the permission. Selecting the number leaves the parent one Ctrl+C
    // away instead of a dead control — and the caller must NOT say "Copied",
    // because that lie is only discovered at the child's login screen.
    if (fallbackEl) {
      const range = document.createRange();
      range.selectNodeContents(fallbackEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return false;
  }
}

export function CopyableId({
  id,
  size = "sm",
}: {
  /** RAW digits — what actually gets copied. */
  id: string;
  /** "lg" is the celebration/reveal size; "sm" sits inline in a card row. */
  size?: "sm" | "lg";
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const numRef = useRef<HTMLSpanElement>(null);
  // Cleared on unmount: a parent who copies and immediately navigates away
  // would otherwise set state on a gone component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    if (!(await copyRawId(id, numRef.current))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, [id]);

  return (
    <button
      type="button"
      className={size === "lg" ? "cid cid-lg" : "cid"}
      data-copied={copied ? "true" : "false"}
      onClick={() => void onCopy()}
      aria-label={t("parent.child.idCopyA11y")}
    >
      {/* The selection fallback targets this node, so it must hold the number
          and nothing else. */}
      <span ref={numRef} className="cid-num">
        {groupChildId(id)}
      </span>
      {/* aria-live so the confirmation is announced, not only seen — the
          button's aria-label names the action, it does not report the result. */}
      <span className="cid-hint" role="status" aria-live="polite">
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2.4" />
            <path
              d="M5 15V5a2 2 0 0 1 2-2h10"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {copied ? t("parent.child.idCopied") : t("parent.child.idCopy")}
      </span>
    </button>
  );
}
