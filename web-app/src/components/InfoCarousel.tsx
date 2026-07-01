"use client";

// Parent information carousel (Phase E2): the numbered rotating panel ported
// from the student panel. Renders 5 numbered slides (carousel.i1..i5) with a
// dot pager + prev/next arrows and gentle auto-advance. All copy is passed in
// from the server page (already localized via getT) so this stays free of any
// client-side i18n dependency. Uses E1's contract classes verbatim.
import { useEffect, useState } from "react";

export type InfoSlide = { title: string; body: string };

export function InfoCarousel({
  title,
  slides,
}: {
  title: string;
  slides: InfoSlide[];
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);

  const go = (next: number) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count);
  };

  // Auto-advance every 6s; pauses are unnecessary for this lightweight panel.
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, 6000);
    return () => clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  return (
    <section className="info-carousel" aria-roledescription="carousel" aria-label={title}>
      <button
        type="button"
        className="info-arrow prev"
        onClick={() => go(index - 1)}
        aria-label="‹"
      >
        ‹
      </button>

      <div className="info-track">
        {slides.map((s, i) => (
          <div
            key={i}
            className="info-slide"
            hidden={i !== index}
            aria-hidden={i !== index}
          >
            <span className="info-slide-num">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="info-arrow next"
        onClick={() => go(index + 1)}
        aria-label="›"
      >
        ›
      </button>

      <div className="info-dots" role="tablist">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            className={i === index ? "info-dot active" : "info-dot"}
            onClick={() => go(i)}
            aria-label={`${i + 1}`}
            aria-selected={i === index}
            role="tab"
          />
        ))}
      </div>
    </section>
  );
}
