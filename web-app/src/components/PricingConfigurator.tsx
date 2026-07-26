"use client";

// PUBLIC PRICING CONFIGURATOR (services page) — the interactive replacement for
// the old static Weekly/Monthly/Yearly cards.
//
// The visitor picks subjects (left column), picks a billing interval, and sees
// a live breakdown + total (right column). Everything recomputes on add,
// remove and interval change.
//
// THIS COMPONENT IS INFORMATIONAL. It cannot start, modify or authorize a
// subscription: it renders numbers and produces a LINK carrying subject ids +
// an interval. No price, discount or total ever leaves the browser, and the
// existing purchase flow still re-prices server-side through the subscription
// RPCs (which is where the sibling discount is applied). See
// lib/pricingConfigurator.ts for the full rationale.
//
// NO SIBLING DISCOUNT IS SHOWN HERE. It depends on how many children a
// specific parent already has, and a signed-out visitor has none — there is no
// honest figure to display. The static sibling note lower on the page stays as
// explanatory copy only.
//
// All arithmetic and all selection rules live in the pure, unit-tested
// lib/pricingConfigurator module (project rule: no business logic in visual
// components). This file is layout, state wiring and accessibility.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { Segmented } from "@/components/Segmented";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  addSubject,
  availableSubjects,
  buildSelectionHref,
  type SelectionBasePath,
  computeQuote,
  formatAzn,
  INTERVAL_LABEL_KEY,
  INTERVAL_PER_KEY,
  PLAN_INTERVALS,
  removeSubject,
  selectedSubjects,
  subjectPrice,
  type ConfiguratorSubject,
  type PlanInterval,
} from "@/lib/pricingConfigurator";

/**
 * Standard visually-hidden style: present for assistive tech, invisible on
 * screen. Kept local because globals.css has no such utility yet and this is
 * its only consumer — promote it to a class if a second one appears.
 */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function PricingConfigurator({
  subjects,
  initialSelected = [],
  initialInterval,
  ctaBasePath,
  ctaNoteKey,
}: {
  /** Active subjects + per-interval list prices, loaded server-side. */
  subjects: ConfiguratorSubject[];
  /** Validated preselection (e.g. from a shared link). */
  initialSelected?: string[];
  /** Validated preselected interval. */
  initialInterval: PlanInterval;
  /**
   * Where "continue" leads: "/register" for a signed-out visitor,
   * "/children/new" for a signed-in parent, or NULL for a signed-in child —
   * children can never purchase, so they get no CTA at all.
   */
  /**
   * Where "Davam et" leads. A literal union, not `string`: the compiler now
   * enforces that this is a same-origin internal route, so no caller can turn
   * the hand-off into an open redirect. `null` = a child session (no CTA).
   */
  ctaBasePath: SelectionBasePath | null;
  /**
   * Message key rendered instead of the CTA when `ctaBasePath` is null.
   * Defaults to the child-session note; the services page passes
   * `gate.paymentsOff` while the payment kill switch is on (Round 51, F4).
   */
  ctaNoteKey?: string;
}) {
  const t = useT();
  const locale = useLocale();

  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [interval, setIntervalState] = useState<PlanInterval>(initialInterval);
  // Round 50 a11y: toggling a subject UNMOUNTS the button that was clicked (the
  // row moves to the other column), which drops keyboard focus to <body>. Move
  // focus to the counterpart control instead, and announce the change — the
  // breakdown's aria-live only reports numbers, never which subject moved.
  const [announcement, setAnnouncement] = useState("");
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    pendingFocusRef.current = null;
    const el = document.querySelector<HTMLElement>(`[data-pcfg-focus="${id}"]`);
    // Fall back to the list heading when the counterpart is gone (e.g. the
    // subject became unavailable), so focus never lands on <body>.
    (el ?? document.getElementById("pcfg-available-h"))?.focus();
  }, [selected]);

  const toggle = (subjectId: string, add: boolean, name: string) => {
    setSelected((prev) =>
      add ? addSubject(prev, subjectId, subjects) : removeSubject(prev, subjectId),
    );
    pendingFocusRef.current = subjectId;
    setAnnouncement(
      (add ? t("cfg.addAria") : t("cfg.removeAria")).replace("{subject}", name),
    );
  };


  const available = useMemo(
    () => availableSubjects(subjects, selected),
    [subjects, selected],
  );
  const chosen = useMemo(() => selectedSubjects(subjects, selected), [subjects, selected]);
  const quote = useMemo(
    () => computeQuote(subjects, selected, interval),
    [subjects, selected, interval],
  );

  const label = (s: ConfiguratorSubject) => subjectLabel(t, s.code, s.name);
  const intervalName = t(INTERVAL_LABEL_KEY[interval]);
  const href = ctaBasePath
    ? buildSelectionHref(ctaBasePath, selected, interval)
    : null;

  return (
    <div className="pcfg">
      {/* ---------------- LEFT: available subjects ---------------- */}
      <section className="pcfg-col pcfg-pick" aria-labelledby="pcfg-available-h">
        {/* Names the subject that moved; the breakdown's live region only
            reports numbers. Visually hidden, announced politely. */}
        <p style={VISUALLY_HIDDEN} role="status" aria-live="polite">
          {announcement}
        </p>
        <h2 className="pcfg-col-title" id="pcfg-available-h" tabIndex={-1}>
          {t("cfg.available")}
        </h2>
        <p className="pcfg-col-hint">{t("cfg.availableHint")}</p>

        {available.length === 0 ? (
          <p className="pcfg-empty">{t("cfg.allAdded")}</p>
        ) : (
          <ul className="pcfg-list">
            {available.map((s) => {
              const price = subjectPrice(s, interval);
              return (
                <li key={s.id} className="pcfg-row">
                  <span className="pcfg-row-main">
                    <span className="pcfg-row-name">{label(s)}</span>
                    <span className="pcfg-row-price">
                      {price === null ? t("cfg.unpriced") : formatAzn(price, locale)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="pcfg-add"
                    onClick={() => toggle(s.id, true, label(s))}
                    aria-label={t("cfg.addAria").replace("{subject}", label(s))}
                    data-pcfg-focus={s.id}
                  >
                    <span aria-hidden="true" className="pcfg-add-glyph">
                      +
                    </span>
                    {t("cfg.add")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------- RIGHT: selection, interval, total ---------------- */}
      <section className="pcfg-col pcfg-summary" aria-labelledby="pcfg-selected-h">
        <h2 className="pcfg-col-title" id="pcfg-selected-h">
          {t("cfg.selected")}
        </h2>

        {chosen.length === 0 ? (
          <p className="pcfg-empty pcfg-empty-strong">{t("cfg.emptySelection")}</p>
        ) : (
          <ul className="pcfg-list pcfg-chosen">
            {chosen.map((s) => {
              const price = subjectPrice(s, interval);
              return (
                <li key={s.id} className="pcfg-row is-selected">
                  <span className="pcfg-row-main">
                    <span className="pcfg-row-name">{label(s)}</span>
                    <span className="pcfg-row-price">
                      {price === null ? t("cfg.unpriced") : formatAzn(price, locale)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="pcfg-remove"
                    onClick={() => toggle(s.id, false, label(s))}
                    aria-label={t("cfg.removeAria").replace("{subject}", label(s))}
                    data-pcfg-focus={s.id}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Billing interval — real radios so arrow-key navigation and screen
            reader semantics come for free. Values are the DB plan_interval
            values ("week" | "month" | "year"). Round 51: renders through the
            shared <Segmented> like every other switcher — the earlier
            CSS-only `:has()` maths left non-:has() engines with the pill
            parked on Weekly and no visible selection at all. */}
        <fieldset className="pcfg-fieldset">
          <legend className="pcfg-legend">{t("cfg.interval")}</legend>
          <Segmented className="pcfg-seg">
            {PLAN_INTERVALS.map((iv) => (
              <label
                key={iv}
                className={iv === interval ? "pcfg-seg-item is-on" : "pcfg-seg-item"}
              >
                <input
                  type="radio"
                  name="pcfg-interval"
                  value={iv}
                  checked={iv === interval}
                  onChange={() => setIntervalState(iv)}
                />
                <span>{t(INTERVAL_LABEL_KEY[iv])}</span>
              </label>
            ))}
          </Segmented>
        </fieldset>

        {/* Breakdown — count, interval, per-subject price, subtotal, total.
            aria-live so a screen reader hears the total change. */}
        <div className="pcfg-breakdown" aria-live="polite">
          <div className="pcfg-brk-row">
            <span>{t("cfg.countLabel")}</span>
            <span className="pcfg-brk-val">
              {/* Show the PRICED denominator when some rows are unpriced, so the
                  count, the per-subject figure and the total agree on screen. */}
              {quote.hasUnpriced ? `${quote.pricedCount} / ${quote.count}` : quote.count}
            </span>
          </div>
          <div className="pcfg-brk-row">
            <span>{t("cfg.intervalLabel")}</span>
            <span className="pcfg-brk-val">{intervalName}</span>
          </div>
          <div className="pcfg-brk-row">
            <span>{t("cfg.perSubjectLabel")}</span>
            <span className="pcfg-brk-val">
              {quote.perSubject === null
                ? quote.hasSelection
                  ? t("cfg.perSubjectMixed")
                  : "—"
                : formatAzn(quote.perSubject, locale)}
            </span>
          </div>
          <div className="pcfg-brk-row">
            <span>{t("cfg.subtotalLabel")}</span>
            <span className="pcfg-brk-val">{formatAzn(quote.subtotal, locale)}</span>
          </div>
          <div className="pcfg-brk-row pcfg-brk-total">
            <span>{t("cfg.totalLabel")}</span>
            <span className="pcfg-brk-val">
              {/* Round 49: when NOTHING in the basket is sold on this interval
                  the sum is 0 — rendering "0,00 AZN" would tell the visitor it
                  is free. Show the placeholder and explain instead. */}
              {quote.allUnpriced ? (
                "—"
              ) : (
                <>
                  {formatAzn(quote.total, locale)}
                  <span className="pcfg-brk-per"> {t(INTERVAL_PER_KEY[interval])}</span>
                </>
              )}
            </span>
          </div>
          {quote.hasUnpriced && (
            <p className="pcfg-brk-warn">
              {quote.allUnpriced
                ? t("cfg.warnAllUnpriced")
                : t("cfg.warnSomeUnpriced").replace(
                    "{n}",
                    String(quote.count - quote.pricedCount),
                  )}
            </p>
          )}
        </div>

        {/* CTA. A child session gets NO purchase CTA (children never purchase);
            an empty selection gets a disabled button instead of a dead link. */}
        {ctaBasePath === null ? (
          <p className="pcfg-cta-note">{t(ctaNoteKey ?? "cfg.childNote")}</p>
        ) : quote.hasSelection && !quote.allUnpriced && href ? (
          <>
            <Link className="pcfg-cta" href={href}>
              {t("cfg.cta")}
            </Link>
            <p className="pcfg-cta-note">
              {ctaBasePath === "/register" ? t("cfg.ctaNoteGuest") : t("cfg.ctaNoteParent")}
            </p>
          </>
        ) : (
          <>
            <button className="pcfg-cta" type="button" disabled>
              {t("cfg.cta")}
            </button>
            <p className="pcfg-cta-note">{t("cfg.emptySelection")}</p>
          </>
        )}

        <p className="pcfg-disclaimer">{t("cfg.serverNote")}</p>
      </section>
    </div>
  );
}
