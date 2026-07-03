"use client";

// Parent information carousel (R8 responsive rework). Shows 2 FULL cards per
// view on desktop (>=860px) and 1 full card on mobile/tablet — never a
// half-cut card: the track shifts page by page, and the last page is clamped
// so it is always completely filled. Each slide wraps its content in an
// equal-height inner card (.ana-slide-card); the outer shell is transparent
// so the two cards read as siblings. Prev/next arrows wrap around, the dot
// pager tracks PAGES (not slides), and a 6s auto-advance runs while the
// pointer is not hovering. Copy arrives from the server page (already
// localized via getT), so the component stays free of client-side i18n.
// Props API unchanged: { title, slides }.
import { useEffect, useRef, useState } from "react";

export type InfoSlide = { title: string; body: string };

// Must match the CSS breakpoint for `.ana-carousel .info-slide` (2-up width).
const TWO_UP_QUERY = "(min-width: 860px)";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === "left" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

export function InfoCarousel({
  title,
  slides,
}: {
  title: string;
  slides: InfoSlide[];
}) {
  const count = slides.length;
  // SSR renders with perView=1 (page 0 → translateX(0), identical markup);
  // the effect below corrects it right after hydration. Slide WIDTHS come
  // from CSS media queries, so the desktop first paint already shows 2 cards.
  const [perView, setPerView] = useState(1);
  const [page, setPage] = useState(0);
  const paused = useRef(false);

  const pageCount = Math.max(1, Math.ceil(count / perView));

  useEffect(() => {
    const mq = window.matchMedia(TWO_UP_QUERY);
    const apply = () => setPerView(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Keep the page valid when the page count shrinks (mobile -> desktop).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const go = (next: number) => {
    if (pageCount <= 1) return;
    setPage(((next % pageCount) + pageCount) % pageCount);
  };

  // Auto-advance every 6s, but skip a tick while the pointer is hovering.
  useEffect(() => {
    if (pageCount <= 1) return;
    const id = setInterval(() => {
      if (paused.current) return;
      setPage((p) => (p + 1) % pageCount);
    }, 6000);
    return () => clearInterval(id);
  }, [pageCount]);

  if (count === 0) return null;

  // First visible slide of this page, clamped so the LAST page is always full
  // (e.g. 5 slides / 2-up → pages start at slides 0, 2, 3 — never a lone half).
  const start = Math.min(page * perView, Math.max(0, count - perView));
  const shift = start * (100 / perView);

  return (
    <section
      className="info-carousel ana-carousel"
      aria-roledescription="carousel"
      aria-label={title}
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
    >
      <div className="ana-car-stage">
        <button
          type="button"
          className="info-arrow prev"
          onClick={() => go(page - 1)}
          aria-label="Previous"
        >
          <Chevron dir="left" />
        </button>

        <div className="ana-car-viewport">
          <div
            className="info-track"
            style={{ transform: `translateX(-${shift}%)` }}
          >
            {slides.map((s, i) => (
              <div
                key={i}
                className="info-slide"
                role="group"
                aria-roledescription="slide"
                aria-hidden={i < start || i >= start + perView}
              >
                <div className="ana-slide-card">
                  <span className="info-slide-num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="info-arrow next"
          onClick={() => go(page + 1)}
          aria-label="Next"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="info-dots" role="tablist" aria-label={title}>
        {Array.from({ length: pageCount }, (_, i) => (
          <button
            key={i}
            type="button"
            className={i === page ? "info-dot active" : "info-dot"}
            onClick={() => go(i)}
            aria-label={`${i + 1}`}
            aria-selected={i === page}
            role="tab"
          />
        ))}
      </div>
    </section>
  );
}
