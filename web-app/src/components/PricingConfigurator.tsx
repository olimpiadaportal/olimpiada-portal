"use client";

// PUBLIC PRICING CONFIGURATOR (services page) — the interactive replacement for
// the old static Weekly/Monthly/Yearly cards.
//
// The visitor picks subjects (left column) and gives EACH of them its own
// billing cycle (right column), with a live per-cycle breakdown below.
// Migration 109 removed the single global "Ödəniş dövrü" control entirely: one
// cycle for the whole basket is exactly what the investor requirement forbids,
// and the database no longer works that way either.
//
// THIS COMPONENT IS INFORMATIONAL. It cannot start, modify or authorize a
// subscription: it renders numbers and produces a LINK carrying subject ids +
// their chosen cycles. No price, discount or total ever leaves the browser, and
// the purchase flow still re-prices server-side through the subscription RPCs
// (which is where the sibling discount is applied). See
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
import { PlanSummary } from "@/components/PlanSummary";
import { SubjectPlanCard } from "@/components/SubjectPlanCard";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  addPlanSubject,
  availableSubjects,
  buildPlanHref,
  type SelectionBasePath,
  computePlanQuote,
  formatAzn,
  INTERVAL_LABEL_KEY,
  PLAN_INTERVALS,
  removePlanSubject,
  setPlanInterval,
  subjectPrice,
  type ConfiguratorSubject,
  type PlanInterval,
  type PlanItem,
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
  initialPlan = [],
  ctaBasePath,
  ctaNoteKey,
}: {
  /** Active subjects + per-interval list prices, loaded server-side. */
  subjects: ConfiguratorSubject[];
  /** Validated preselection (e.g. from a shared link), each with its cycle. */
  initialPlan?: PlanItem[];
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

  const [plan, setPlan] = useState<PlanItem[]>(initialPlan);
  // Round 50 a11y: toggling a subject UNMOUNTS the button that was clicked (the
  // row moves to the other column), which drops keyboard focus to <body>. Move
  // focus to the counterpart control instead, and announce the change — the
  // breakdown's aria-live only reports numbers, never which subject moved.
  const [announcement, setAnnouncement] = useState("");
  const pendingFocusRef = useRef<string | null>(null);
  const selected = useMemo(() => plan.map((p) => p.subjectId), [plan]);

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    pendingFocusRef.current = null;
    const el = document.querySelector<HTMLElement>(`[data-pcfg-focus="${id}"]`);
    // Fall back to the list heading when the counterpart is gone (e.g. the
    // subject became unavailable), so focus never lands on <body>.
    (el ?? document.getElementById("pcfg-available-h"))?.focus();
  }, [plan]);

  const toggle = (subjectId: string, add: boolean, name: string) => {
    setPlan((prev) =>
      add ? addPlanSubject(prev, subjectId, subjects) : removePlanSubject(prev, subjectId),
    );
    pendingFocusRef.current = subjectId;
    setAnnouncement(
      (add ? t("cfg.addAria") : t("cfg.removeAria")).replace("{subject}", name),
    );
  };

  // Changing one card's cycle must never touch another's — setPlanInterval
  // returns every other entry by reference, and the change is announced
  // separately because the breakdown's live region only reports numbers.
  const changeInterval = (subjectId: string, iv: PlanInterval, name: string) => {
    setPlan((prev) => setPlanInterval(prev, subjectId, iv));
    setAnnouncement(
      t("plan.cycleChangedAria")
        .replace("{subject}", name)
        .replace("{cycle}", t(INTERVAL_LABEL_KEY[iv])),
    );
  };

  const available = useMemo(
    () => availableSubjects(subjects, selected),
    [subjects, selected],
  );
  const byId = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  const quote = useMemo(() => computePlanQuote(subjects, plan), [subjects, plan]);

  const label = (s: ConfiguratorSubject) => subjectLabel(t, s.code, s.name);
  /** The cheapest cycle a subject is actually sold on — the "from" price. */
  const cheapest = (s: ConfiguratorSubject): { price: number; iv: PlanInterval } | null => {
    let best: { price: number; iv: PlanInterval } | null = null;
    for (const iv of PLAN_INTERVALS) {
      const p = subjectPrice(s, iv);
      if (p === null) continue;
      if (!best || p < best.price) best = { price: p, iv };
    }
    return best;
  };
  const href = ctaBasePath ? buildPlanHref(ctaBasePath, plan) : null;

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
              // There is no global cycle any more, so a single price here would
              // be a price for nothing. Show the CHEAPEST cycle, labelled.
              const from = cheapest(s);
              return (
                <li key={s.id} className="pcfg-row">
                  <span className="pcfg-row-main">
                    <span className="pcfg-row-name">{label(s)}</span>
                    <span className="pcfg-row-price">
                      {from === null
                        ? t("cfg.unpriced")
                        : t("plan.fromPrice")
                            .replace("{price}", formatAzn(from.price, locale))
                            .replace("{cycle}", t(INTERVAL_LABEL_KEY[from.iv]))}
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

        {plan.length === 0 ? (
          <p className="pcfg-empty pcfg-empty-strong">{t("cfg.emptySelection")}</p>
        ) : (
          <>
            <p className="pcfg-col-hint">{t("plan.perSubjectHint")}</p>
            <div className="splan-list">
              {plan.map((item) => {
                const s = byId.get(item.subjectId);
                if (!s) return null;
                return (
                  <SubjectPlanCard
                    key={s.id}
                    id={s.id}
                    code={s.code}
                    name={s.name}
                    interval={item.interval}
                    prices={s.prices}
                    onIntervalChange={(id, iv) => changeInterval(id, iv, label(s))}
                    onRemove={(id) => toggle(id, false, label(s))}
                    locale={locale}
                    t={t}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Per-cycle breakdown. No single periodic total is printed when the
            cycles differ — see PlanSummary for why that would be a false price. */}
        <div className="pcfg-breakdown">
          <div className="pcfg-brk-row">
            <span>{t("cfg.countLabel")}</span>
            <span className="pcfg-brk-val">
              {/* Show the PRICED denominator when some rows are unpriced, so the
                  count and the amounts agree on screen. */}
              {quote.hasUnpriced
                ? `${quote.pricedCount} / ${quote.lines.length}`
                : quote.lines.length}
            </span>
          </div>
          <PlanSummary quote={quote} locale={locale} t={t} />
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
