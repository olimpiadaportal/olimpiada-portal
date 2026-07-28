"use client";

// Mobile on-screen-keyboard inset publisher.
//
// PROBLEM this solves: on a phone the software keyboard covers the bottom of
// the screen, but iOS Safari never resizes the LAYOUT viewport for it — so no
// CSS length unit (`dvh` included) reacts to the keyboard on iOS, and on
// Android the behaviour is browser-version dependent. `window.visualViewport`
// is the only cross-platform signal, and it is a read-only browser API (no new
// dependency).
//
// CONTRACT: this component publishes the keyboard overlap as one CSS custom
// property on <html>:
//
//     --kb-inset: <overlap>px      // exactly 0px whenever no keyboard is up
//
// Every consumer of `--kb-inset` in globals.css lives inside
// `@media (pointer: coarse)`, so a desktop browser renders byte-identically
// even though the property is defined there too (on desktop the value stays
// 0px anyway — there is no on-screen keyboard to shrink the visual viewport).
//
// Renders nothing, holds no state, contains no product logic — layout only.
import { useEffect } from "react";

export function KeyboardInset() {
  useEffect(() => {
    // Guarded: `visualViewport` is undefined on older browsers. When it is
    // missing we publish nothing and every `var(--kb-inset, 0px)` consumer
    // falls back to 0px — i.e. exactly today's rendering.
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    let frame = 0;
    let last = -1;

    const apply = () => {
      frame = 0;
      // Pinch-zoom also shrinks the visual viewport. Treating that as a
      // keyboard would inject phantom spacing, so only trust an unzoomed page.
      const zoomed = typeof vv.scale === "number" && vv.scale > 1.01;
      const raw = zoomed ? 0 : window.innerHeight - (vv.height + vv.offsetTop);
      // Threshold: sub-pixel rounding and URL-bar collapse produce a few px of
      // difference that must never register as a keyboard (that is what would
      // otherwise leave "permanent empty space" with the keyboard closed).
      const next = raw > 24 ? Math.round(raw) : 0;
      if (next === last) return;
      last = next;
      root.style.setProperty("--kb-inset", `${next}px`);
    };

    // rAF-throttled: visualViewport fires resize/scroll continuously during the
    // keyboard animation and during momentum scrolling.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    apply();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      root.style.removeProperty("--kb-inset");
    };
  }, []);

  return null;
}
