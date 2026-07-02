"use client";

// Parent information carousel: a real single-slide carousel. The track holds all
// slides side-by-side (each 100% wide) and is shifted with translateX(-index*100%)
// so exactly ONE slide is visible at a time. Prev/next arrows wrap around, the dot
// pager jumps to a slide + reflects the active one, and a 6s auto-advance runs while
// the pointer is not hovering the carousel. All copy is passed in from the server
// page (already localized via getT) so this stays free of client-side i18n. Uses the
// contract classes: .info-carousel/.info-track/.info-slide/.info-slide-num/.info-dots/
// .info-dot(.active)/.info-arrow(.prev/.next).
import { useEffect, useRef, useState } from "react";

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
  const paused = useRef(false);

  const go = (next: number) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count);
  };

  // Auto-advance every 6s, but skip a tick while the pointer is hovering (paused).
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      if (paused.current) return;
      setIndex((i) => (i + 1) % count);
    }, 6000);
    return () => clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  return (
    <section
      className="info-carousel"
      aria-roledescription="carousel"
      aria-label={title}
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
    >
      <button
        type="button"
        className="info-arrow prev"
        onClick={() => go(index - 1)}
        aria-label="Previous"
      >
        ‹
      </button>

      <div className="info-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => (
          <div
            key={i}
            className="info-slide"
            role="group"
            aria-roledescription="slide"
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
        aria-label="Next"
      >
        ›
      </button>

      <div className="info-dots" role="tablist" aria-label={title}>
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
