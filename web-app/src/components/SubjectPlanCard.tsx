"use client";

// ONE selected subject, with ITS OWN billing cycle (migration 109).
//
// This is the contract card the investor asked for — subject name, its cycle,
// the calculated price for that cycle, and a remove action — and it exists once
// so the public configurator, the start-a-plan form, the Add-Child wizard and
// the Manage-Subjects editor cannot drift into four different versions of it.
//
// NO BUSINESS LOGIC HERE. Every number arrives already computed by the pure
// lib/pricingConfigurator module (or, where a live subscription exists, by the
// authoritative server quote). This file is layout, state wiring and
// accessibility.
//
// A11y note that drove the markup: five stacked cards mean five identical
// "Həftəlik / Aylıq / İllik" radio groups on one page. Each group therefore
// gets its own `name` AND an aria-label naming the subject, so a screen-reader
// user can tell which subject they are changing.
import { Segmented } from "@/components/Segmented";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  formatAzn,
  INTERVAL_LABEL_KEY,
  INTERVAL_PER_KEY,
  PLAN_INTERVALS,
  type PlanInterval,
} from "@/lib/pricingConfigurator";
import type { Locale } from "@/i18n/config";

export type SubjectPlanCardChip = "active" | "ending" | "pendingChange";

export function SubjectPlanCard({
  id,
  code,
  name,
  interval,
  prices,
  onIntervalChange,
  onRemove,
  removeDisabled = false,
  removeDisabledReason,
  disabled = false,
  cycleDisabled = false,
  loading = false,
  chip,
  chipText,
  locale,
  t,
}: {
  id: string;
  code: string | null;
  name: string;
  /** The cycle chosen FOR THIS SUBJECT. */
  interval: PlanInterval;
  /** List price per cycle. A missing cycle means "not sold that way". */
  prices: Partial<Record<PlanInterval, number>>;
  onIntervalChange: (id: string, interval: PlanInterval) => void;
  /** Omitted where removal is not offered (e.g. a read-only review step). */
  onRemove?: (id: string) => void;
  removeDisabled?: boolean;
  /** Tooltip explaining why removal is blocked (usually "≥1 subject must remain"). */
  removeDisabledReason?: string;
  /** A pending save: the whole card goes non-interactive, removal included. */
  disabled?: boolean;
  /**
   * Only the CYCLE control is frozen; REMOVAL stays available.
   *
   * Payments being off must never block a removal. The database has always
   * allowed one (`assert_payments_enabled` fires on adds and cycle changes
   * only) so a parent is never trapped inside a plan they are leaving, and
   * folding that state into `disabled` contradicted the server: every remove
   * button on a covered subject went grey with no explanation, leaving a
   * paying parent with no available action at all.
   */
  cycleDisabled?: boolean;
  /** A newer server quote is in flight — only the PRICE cell shows it. */
  loading?: boolean;
  chip?: SubjectPlanCardChip;
  chipText?: string;
  locale: Locale;
  t: (key: string) => string;
}) {
  const label = subjectLabel(t, code, name);
  const price = prices[interval];
  const priced = typeof price === "number" && Number.isFinite(price);

  return (
    <div
      className={`splan-card${disabled ? " is-disabled" : ""}${loading ? " is-loading" : ""}`}
    >
      <div className="splan-name">
        <span className="splan-subject">{label}</span>
        {chip && chipText && (
          <span className={`splan-chip splan-chip-${chip}`}>{chipText}</span>
        )}
        {onRemove && (
          // Labelled, not a bare ×. The 28px glyph-only circle it replaces was
          // both unreadable ("×" next to a subject name reads as decoration)
          // and well under the 44px touch floor. It is now the danger-tinted
          // mirror of the `.pcfg-add` pill sitting opposite it on the same
          // page, so Add and Remove read as one pair. The subject-specific
          // aria-label stays — the visible label cannot name the subject
          // without making five stacked cards unreadably repetitive.
          <button
            type="button"
            className="splan-remove"
            onClick={() => onRemove(id)}
            disabled={disabled || removeDisabled}
            title={removeDisabled ? removeDisabledReason : undefined}
            aria-label={t("plan.removeAria").replace("{subject}", label)}
          >
            <span aria-hidden="true" className="splan-remove-glyph">
              −
            </span>
            {t("plan.removeSubject")}
          </button>
        )}
      </div>

      <fieldset
        className="splan-plan"
        aria-label={t("plan.cycleAria").replace("{subject}", label)}
        disabled={disabled || cycleDisabled}
      >
        <Segmented className="splan-seg" track>
          {PLAN_INTERVALS.map((iv) => {
            // A cycle this subject is not sold on stays visible but
            // unselectable — hiding it would make the control's shape depend on
            // the subject and the row would jump as the selection changes.
            const sold = typeof prices[iv] === "number" && Number.isFinite(prices[iv]);
            const on = iv === interval;
            return (
              <label
                key={iv}
                className={`splan-seg-item${on ? " is-on" : ""}${sold ? "" : " is-unsold"}`}
                title={sold ? undefined : t("cfg.unpriced")}
              >
                <input
                  type="radio"
                  name={`splan-${id}`}
                  value={iv}
                  checked={on}
                  disabled={disabled || cycleDisabled || !sold}
                  onChange={() => onIntervalChange(id, iv)}
                />
                <span>{t(INTERVAL_LABEL_KEY[iv])}</span>
              </label>
            );
          })}
        </Segmented>
      </fieldset>

      <div className="splan-price" aria-live="polite">
        {loading ? (
          <span className="splan-price-skeleton" aria-hidden="true" />
        ) : priced ? (
          // key={interval} restarts the fade so the new figure is noticed
          // without the row reflowing (the cell reserves its width in CSS).
          <span key={interval} className="splan-price-value">
            <span className="mono">{formatAzn(price, locale)}</span>
            <span className="splan-price-per">{t(INTERVAL_PER_KEY[interval])}</span>
          </span>
        ) : (
          <span className="splan-price-value">
            <span className="mono">—</span>
            <span className="splan-price-per">{t("cfg.unpriced")}</span>
          </span>
        )}
      </div>
    </div>
  );
}
