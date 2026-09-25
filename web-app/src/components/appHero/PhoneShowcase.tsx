"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./appHero.module.css";

// The phone mockup, its screenshot carousel, and the floating feature cards.
//
// MOTION BUDGET. Everything that moves here moves by `transform` or `opacity`,
// so none of it triggers layout. The pointer never causes a React render: the
// handler writes two CSS custom properties on the stage inside one
// requestAnimationFrame, and the tilt, the screenshot shift, the shadow and the
// card parallax all read them in CSS. React state changes only when the
// carousel advances.
//
// REDUCED MOTION is honoured twice: CSS removes every animation and transition
// under `prefers-reduced-motion: reduce`, and this component stops the
// carousel's autoplay and ignores the pointer, so nothing moves on its own.

export type ShowcaseScreen = {
  src: string;
  width: number;
  height: number;
  alt: string;
  topColor: string;
};

export type ShowcaseCard = {
  title: string;
  body: string;
  icon: "olympiad" | "progress" | "news";
};

export type ShowcaseLabels = {
  carousel: string;
  /** "Screen {n} of {total}" */
  slide: string;
  /** "Show screen {n} of {total}" */
  show: string;
  pause: string;
  play: string;
};

type Props = {
  screens: ShowcaseScreen[];
  cards: ShowcaseCard[];
  labels: ShowcaseLabels;
  intervalMs: number;
};

const fill = (pattern: string, n: number, total: number) =>
  pattern.replace("{n}", String(n)).replace("{total}", String(total));

/** Live `prefers-reduced-motion`, false on the server and on first render. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function CardIcon({ kind }: { kind: ShowcaseCard["icon"] }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true as const, focusable: "false" as const };
  switch (kind) {
    case "olympiad":
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M7 6H4.5a2.5 2.5 0 0 0 3 3M17 6h2.5a2.5 2.5 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "progress":
      return (
        <svg {...common}>
          <path d="M4 17l5-5 4 4 7-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 8h5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "news":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9.5h8M8 13h8M8 16.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

/** A minimal iOS status bar: time left, signal / Wi-Fi / battery right. */
function StatusBar() {
  return (
    <div className={s.statusBar} aria-hidden="true">
      <span className={s.statusTime}>9:41</span>
      <span className={s.island} />
      <span className={s.statusIcons}>
        <svg viewBox="0 0 18 12">
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 16 12">
          <path d="M8 11.5 5.6 8.7a3.4 3.4 0 0 1 4.8 0z" fill="currentColor" />
          <path d="M3.4 6.6a6.5 6.5 0 0 1 9.2 0M1.2 4.3a9.7 9.7 0 0 1 13.6 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 27 12">
          <rect x="0.75" y="0.75" width="22" height="10.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
          <rect x="2.5" y="2.5" width="18.5" height="7" rx="1.6" fill="currentColor" />
          <path d="M24.5 4v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

export function PhoneShowcase({ screens, cards, labels, intervalMs }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  // Three independent reasons to hold the carousel still, kept apart so that
  // one ending (the pointer leaving) cannot cancel another (the user's pause).
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [onScreen, setOnScreen] = useState(true);

  const count = screens.length;
  const canAutoplay = count > 1 && !reduceMotion;
  const playing = canAutoplay && !userPaused && !hovering && onScreen;

  // Autoplay. The interval restarts whenever a manual pick changes `active`,
  // so a screen the user just chose always gets its full time on stage.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setActive((i) => (i + 1) % count), intervalMs);
    return () => window.clearTimeout(id);
  }, [playing, active, count, intervalMs]);

  // Hold still while the hero is scrolled away or the tab is in the background:
  // nobody is watching, and it keeps the page from working for no one.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let visible = true;
    const sync = () => setOnScreen(visible && document.visibilityState === "visible");
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Pointer-driven tilt: fine pointers only, never under reduced motion.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || reduceMotion) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const write = () => {
      frame = 0;
      el.style.setProperty("--px", x.toFixed(3));
      el.style.setProperty("--py", y.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const onMove = (e: PointerEvent) => {
      if (!fine.matches || e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      x = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      y = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      schedule();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      schedule();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty("--px");
      el.style.removeProperty("--py");
    };
  }, [reduceMotion]);

  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHovering(true);
  }, []);
  const onPointerLeave = useCallback(() => setHovering(false), []);

  const current = screens[active];

  return (
    <div className={s.stageCol}>
      <div
        ref={stageRef}
        className={s.stage}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        // Keyboard users get the same pause-on-hover as mouse users.
        onFocus={() => setHovering(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovering(false);
        }}
      >
        <div className={`${s.halo} ${s.late}`} aria-hidden="true" />
        <div className={s.floorShadow} aria-hidden="true" />

        <div className={s.phoneEnter}>
          <div className={s.phoneFloat}>
            <div className={s.phoneTilt}>
              <div className={s.phone}>
                <span className={s.sideButton} aria-hidden="true" />
                <div className={s.screen}>
                  <div className={s.statusWrap} style={{ backgroundColor: current?.topColor }}>
                    <StatusBar />
                  </div>
                  <div
                    className={s.slides}
                    role="group"
                    aria-roledescription="carousel"
                    aria-label={labels.carousel}
                    // Announce changes only when the user drives them; an
                    // autoplaying region that talks every few seconds is noise.
                    aria-live={playing ? "off" : "polite"}
                  >
                    {screens.map((screen, i) => (
                      <div
                        key={screen.src}
                        className={s.slide}
                        data-active={i === active ? "true" : undefined}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={fill(labels.slide, i + 1, count)}
                        aria-hidden={i === active ? undefined : true}
                      >
                        <Image
                          src={screen.src}
                          alt={screen.alt}
                          width={screen.width}
                          height={screen.height}
                          sizes="(max-width: 767px) 200px, 264px"
                          // The first screen is the hero's largest image and
                          // is on screen at load; the rest can wait.
                          priority={i === 0}
                          loading={i === 0 ? undefined : "lazy"}
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                  <span className={s.glare} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {cards.map((card, i) => (
          <div key={card.title} className={`${s.cardSlot} ${s[`cardSlot${i + 1}`]}`} aria-hidden="true">
            <div className={s.cardParallax}>
              <div className={s.cardFloat}>
                <div className={s.card}>
                  <span className={s.cardIcon}>
                    <CardIcon kind={card.icon} />
                  </span>
                  <span className={s.cardText}>
                    <span className={s.cardTitle}>{card.title}</span>
                    <span className={s.cardBody}>{card.body}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={`${s.pager} ${s.late}`}>
          {screens.map((screen, i) => (
            <button
              key={screen.src}
              type="button"
              className={s.dot}
              aria-label={fill(labels.show, i + 1, count)}
              aria-current={i === active ? "true" : undefined}
              onClick={() => setActive(i)}
            />
          ))}
          {canAutoplay && (
            // WCAG 2.2.2: content that moves on its own for more than five
            // seconds needs a control that stops it — hover alone does not
            // reach touch or keyboard users.
            <button
              type="button"
              className={s.pauseBtn}
              // The label names the action the button will take; pairing it
              // with aria-pressed as well would describe the state twice.
              aria-label={userPaused ? labels.play : labels.pause}
              onClick={() => setUserPaused((p) => !p)}
            >
              {userPaused ? (
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 2v8l7-4z" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="2.5" y="2" width="2.4" height="8" rx="0.8" fill="currentColor" />
                  <rect x="7.1" y="2" width="2.4" height="8" rx="0.8" fill="currentColor" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
