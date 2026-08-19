"use client";

// MANAGE SUBJECTS — the editor for a child's LIVE subscription.
//
// Migration 109 turned this into a per-subject PLAN editor: every covered
// subject carries its own billing cycle, so the parent can add a subject,
// remove one, or move one subject to another cycle without touching the rest.
// The old single subscription-level `interval` prop is gone — one cycle for the
// whole plan is no longer true in the database and cannot be true here.
//
// PRORATION AND THE SHARED RENEWAL DATE ARE RETIRED (owner, 2026-08-17). An
// added subject is not squeezed into a period the child already paid for: it
// opens its OWN period today and is charged that period in full. So this screen
// no longer prints one combined "next payment" line or explains a part-period
// calculation. It prints, per subject, the three facts the parent actually
// needs — its cycle, its price and WHEN IT RENEWS — with the dates read from
// each subject's own `current_period_end`.
//
// PAYMENT-FIRST contract (owner requirement), now four-way:
//   * A TRUE ADDITION (including a mixed diff) opens the confirmation sheet
//     (PlanChangeConfirmModal) BEFORE the apply — the parent sees the
//     authoritative amount and what it buys before anything is charged, and the
//     real charge seam stays server-side.
//   * A REMOVAL-ONLY diff submits directly: nothing is charged, access runs to
//     that subject's own period end and no refund is ever made.
//   * A CYCLE-CHANGE-ONLY diff also submits directly. It is SCHEDULED into
//     pending_interval and takes effect at that subject's next renewal, so
//     there is nothing to charge now and a payment sheet would be a lie.
//   * A REINSTATEMENT-ONLY diff submits directly too (migration 120). Putting
//     back a subject whose removal is scheduled but whose period has not lapsed
//     is an UN-CANCEL: the DB clears remove_at and changes nothing else, so the
//     parent pays NOTHING for coverage they already own. Before 120 this screen
//     called it an "addition", opened a payment sheet and the server charged a
//     second full period — while the removal rule promises access to period end
//     with no refund. Once that period HAS lapsed it is a genuine add again,
//     and the server (never this component) is what decides which it is.
//
// The SERVER receives the DESIRED FULL set (subject + cycle) and derives the
// adds / removes / cycle changes itself — ownership recheck, payment-mode gate
// and every amount are server-side; the client never sends a price. Every
// amount shown here comes from the quote RPC (or, before any change is pending,
// from the same list prices the server rendered the page with), so the preview
// can never drift from what is charged.
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  quoteSubjectChange,
  updateSubscriptionSubjectsAction,
  type SubjectChangeQuote,
  type SubjectsUpdateState,
} from "@/lib/auth/subscriptionService";
import { PlanChangeConfirmModal } from "@/components/PlanChangeConfirmModal";
import { PlanSummary } from "@/components/PlanSummary";
import { SubjectPlanCard } from "@/components/SubjectPlanCard";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatLongDate } from "@/lib/formatDate";
import { subjectLabel } from "@/lib/subjectLabel";
import { isReinstatement } from "@/lib/planBasket";
import {
  addPlanSubject,
  availableSubjects,
  computePlanQuote,
  DEFAULT_PLAN_INTERVAL,
  formatAzn,
  INTERVAL_LABEL_KEY,
  isPlanInterval,
  PLAN_INTERVALS,
  removePlanSubject,
  setPlanInterval,
  subjectPrice,
  type ConfiguratorSubject,
  type PlanInterval,
  type PlanItem,
} from "@/lib/pricingConfigurator";

type Subj = { id: string; code: string | null; name: string; prices: Record<string, number> };

/** One subject as the live subscription currently covers it. */
export type CoveredSubject = {
  subjectId: string;
  /** Resolved cycle: the subject's own, falling back to the subscription's. */
  interval: string;
  /** A cycle change already scheduled for this subject's renewal. */
  pendingInterval: string | null;
  /** This subject's own period end. */
  periodEnd: string | null;
  /** Set once a removal is scheduled — access still runs to periodEnd. */
  removeAt: string | null;
};

export function ManageSubjects({
  studentId,
  subjects,
  covered,
  paymentMode,
  dict,
}: {
  studentId: string;
  subjects: Subj[];
  covered: CoveredSubject[];
  /**
   * Server-resolved payment mode. "real" | "giveaway" → full editor. "off" →
   * REMOVAL-ONLY (Round 51, audit F7): the DB kill switch blocks ADDS and, since
   * 109, cycle changes too — a cycle change is a billing change — but
   * deliberately keeps removals legal, so a parent can always stop paying.
   */
  paymentMode: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  // Locale-aware subject labels (subj.<code>) via the app-wide provider dict.
  const t = useT();
  const locale = useLocale();

  // Round 46: every date on this page goes through the shared Baku formatter —
  // a local Intl.DateTimeFormat here is what produced the "2026 M08 22"
  // root-locale output when the runtime had no az month data.
  const fmtDate = useCallback(
    (iso: string | null) => formatLongDate(iso, locale),
    [locale],
  );

  const catalog = useMemo<ConfiguratorSubject[]>(
    () => subjects.map((s) => ({ ...s, prices: s.prices as ConfiguratorSubject["prices"] })),
    [subjects],
  );
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  // The GO-FORWARD plan = covered subjects that are not already scheduled for
  // removal. A scheduled removal renders as an available subject again, so
  // re-adding it cancels the removal (apply_plan_change clears remove_at).
  const active = useMemo(() => covered.filter((c) => !c.removeAt), [covered]);
  const activeById = useMemo(
    () => new Map(active.map((c) => [c.subjectId, c])),
    [active],
  );
  const endingById = useMemo(
    () => new Map(covered.filter((c) => c.removeAt).map((c) => [c.subjectId, c])),
    [covered],
  );
  // Re-selecting one of THESE is an un-cancel, not a purchase: the removal is
  // scheduled but the paid period has not run out yet. Mirrors the DB
  // classifier (plan_change_states, migration 120) on the data the page was
  // rendered with, so the copy is right immediately — before the debounced
  // quote lands. The MONEY decision below still defers to the server.
  const reinstatableById = useMemo(
    () =>
      new Map(
        covered
          .filter((c) =>
            isReinstatement({ remove_at: c.removeAt, current_period_end: c.periodEnd }),
          )
          .map((c) => [c.subjectId, c]),
      ),
    [covered],
  );
  // The cycle a subject is EFFECTIVELY on = a scheduled change first, then the
  // cycle it is paid on. Seeding the editor from `interval` alone is what made
  // a saved cycle change look like it had failed: the radio snapped straight
  // back to the old cycle on the next render, because the change lives in
  // pending_interval until that subject's own period ends.
  const effectiveCycle = useCallback(
    (c: CoveredSubject): PlanInterval => {
      const raw = c.pendingInterval ?? c.interval;
      return isPlanInterval(raw) ? raw : DEFAULT_PLAN_INTERVAL;
    },
    [],
  );
  // Resync key: subjects AND their effective cycles, so a successful save +
  // revalidate resets the editor even when only a cycle moved.
  const coveredKey = useMemo(
    () =>
      active
        .map((c) => `${c.subjectId}:${effectiveCycle(c)}`)
        .sort()
        .join(","),
    [active, effectiveCycle],
  );

  const seedPlan = useCallback(
    (): PlanItem[] =>
      active.map((c) => ({ subjectId: c.subjectId, interval: effectiveCycle(c) })),
    [active, effectiveCycle],
  );
  const [plan, setPlan] = useState<PlanItem[]>(seedPlan);
  useEffect(() => {
    setPlan(seedPlan());
    // seedPlan is derived from `active`; coveredKey is the value that actually
    // changes when the server revalidates after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coveredKey]);

  const available = useMemo(
    () => availableSubjects(catalog, plan.map((p) => p.subjectId)),
    [catalog, plan],
  );
  const localQuote = useMemo(() => computePlanQuote(catalog, plan), [catalog, plan]);

  // Four-way diff. A cycle change is a real change even though the subject set
  // is identical — without it the "no changes" state would swallow it. And a
  // REINSTATEMENT is split out of the additions: it is the same click, but it
  // buys nothing, so listing it under "Added" next to a due-now amount is the
  // copy that used to lie.
  const { toAdd, toReinstate, toRemove, toChangePlan } = useMemo(() => {
    const inPlan = new Set(plan.map((p) => p.subjectId));
    return {
      toAdd: plan.filter(
        (p) => !activeById.has(p.subjectId) && !reinstatableById.has(p.subjectId),
      ),
      toReinstate: plan.filter(
        (p) => !activeById.has(p.subjectId) && reinstatableById.has(p.subjectId),
      ),
      toRemove: active.filter((c) => !inPlan.has(c.subjectId)),
      // Compared against the EFFECTIVE cycle (a scheduled change wins), so
      // re-selecting the cycle the subject is actually paid on registers as a
      // change and CANCELS the schedule. Comparing against `interval` alone
      // meant a parent who mis-clicked "yearly" got hasDiff === false and a
      // disabled Save — locked into the mistake with no way back.
      // A reinstated subject counts here too: the server schedules that cycle
      // for its own renewal instead of switching it on the spot.
      toChangePlan: plan.filter((p) => {
        const cur = activeById.get(p.subjectId) ?? reinstatableById.get(p.subjectId);
        return !!cur && effectiveCycle(cur) !== p.interval;
      }),
    };
  }, [plan, active, activeById, reinstatableById, effectiveCycle]);
  const hasDiff =
    toAdd.length > 0 ||
    toReinstate.length > 0 ||
    toRemove.length > 0 ||
    toChangePlan.length > 0;
  const planKey = useMemo(
    () => plan.map((p) => `${p.subjectId}:${p.interval}`).join(","),
    [plan],
  );

  // Debounced (~400ms) AUTHORITATIVE preview of the DESIRED FULL set — the same
  // numbers apply_plan_change will charge. seqRef drops a stale response so a
  // slow request for an older basket can never overwrite a newer one.
  const [quote, setQuote] = useState<SubjectChangeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const seqRef = useRef(0);
  useEffect(() => {
    if (!hasDiff || !planKey) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    const items = planKey.split(",").map((raw) => {
      const [subjectId, interval] = raw.split(":");
      return { subjectId, interval };
    });
    const seq = ++seqRef.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      quoteSubjectChange({ studentId, items })
        .then((res) => {
          if (seqRef.current !== seq) return; // stale response — ignore
          setQuote(res.ok ? res.quote : null);
          setQuoting(false);
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setQuote(null);
          setQuoting(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [hasDiff, planKey, studentId]);

  // dueNow === 0 with an addition pending means the adds ride a running trial —
  // the sentence therefore names the FIRST CHARGE date, not an "effective from"
  // date for a rate change that no longer exists.
  const noChargeSentence = (q: SubjectChangeQuote) =>
    tt("subjedit.noChargeNow").replace("{date}", fmtDate(q.effectiveFrom));
  // ONE LINE PER REMOVED SUBJECT, each with ITS OWN period end. The single
  // `removalsEffectiveAt` scalar cannot describe a plan whose subjects run to
  // different dates — dropping a yearly subject from a plan that also held a
  // weekly one told the parent access ended in 7 days while the database
  // granted a year. That scalar survives only as the legacy mobile fallback.
  const removalLines = (q: SubjectChangeQuote): string[] =>
    (q.removals ?? []).map((r) => {
      const s = byId.get(r.subject_id);
      return tt("subjedit.noteLine")
        .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : r.subject_id)
        .replace("{date}", fmtDate(r.remove_at));
    });
  const cycleName = (iv: string) =>
    isPlanInterval(iv) ? tt(INTERVAL_LABEL_KEY[iv]) : iv;

  // PER-SUBJECT BILLING. This replaces the per-cycle "your subjects renew at
  // {total}" sentences AND the single next-payment line: with independent
  // cycles the only honest renewal statement is made one subject at a time.
  // Prices prefer the server quote's own per-subject figure and fall back to
  // the list price the page was rendered with (identical source table, and the
  // only thing available before a change is pending); the per-cycle DISCOUNTED
  // subtotals stay in the PlanSummary breakdown below.
  const quotePrice = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const it of quote?.items ?? []) m.set(it.subject_id, it.price);
    return m;
  }, [quote]);

  const planRows = useMemo(
    () =>
      plan.map((item) => {
        const s = byId.get(item.subjectId);
        // A subject being reinstated is answered from ITS OWN row: it keeps the
        // period it already paid for, so the honest sentence is "renews on
        // {its date}" — not "starts today", which is what an absent row used to
        // produce and what the retired second charge was based on.
        const cur = activeById.get(item.subjectId) ?? reinstatableById.get(item.subjectId);
        const price = quotePrice.has(item.subjectId)
          ? (quotePrice.get(item.subjectId) ?? null)
          : s
            ? subjectPrice(s, item.interval)
            : null;
        const head = tt("subjedit.subjectPlanLine")
          .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : item.subjectId)
          .replace("{cycle}", cycleName(item.interval))
          .replace(
            "{price}",
            price === null ? tt("cfg.unpriced") : formatAzn(price, locale),
          );
        // A subject the child does not have yet starts TODAY and pays a full
        // period; one that is moving cycle runs its paid period out first; every
        // other one simply renews on its own date.
        const when = !cur
          ? tt("subjedit.startsToday")
          : effectiveCycle(cur) !== item.interval
            ? tt("subjedit.switchesOn")
                .replace("{date}", fmtDate(cur.periodEnd))
                .replace("{cycle}", cycleName(item.interval))
            : tt("subjedit.renewsOn").replace("{date}", fmtDate(cur.periodEnd));
        return { subjectId: item.subjectId, head, when };
      }),
    // tt/t/cycleName are derived from the props' dict and never change identity
    // in a way that matters here; the data inputs are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, byId, activeById, reinstatableById, quotePrice, effectiveCycle, fmtDate, locale],
  );
  const addedIds = useMemo(() => new Set(toAdd.map((p) => p.subjectId)), [toAdd]);
  const reinstatedIds = useMemo(
    () => new Set(toReinstate.map((p) => p.subjectId)),
    [toReinstate],
  );
  // ONE LINE PER REINSTATED SUBJECT: what it is, and the date it keeps.
  const reinstateLines = (): string[] =>
    toReinstate.map((p) => {
      const s = byId.get(p.subjectId);
      const cur = reinstatableById.get(p.subjectId);
      return tt("subjedit.reinstateLine")
        .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : p.subjectId)
        .replace("{date}", fmtDate(cur?.periodEnd ?? cur?.removeAt ?? null));
    });

  const [state, formAction, saving] = useActionState<SubjectsUpdateState, FormData>(
    updateSubscriptionSubjectsAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [payOpen, setPayOpen] = useState(false);

  // Payments off → adds AND cycle changes are refused server-side
  // (assert_payments_enabled); mirror that here. Removals stay available.
  const addsDisabled = paymentMode === "off";

  function onSaveClick() {
    if (!hasDiff || saving) return;
    // PAYMENT-FIRST: only a TRUE ADDITION costs money now. A scheduled cycle
    // change and a removal both charge nothing, so they submit directly —
    // unchanged behaviour.
    if (toAdd.length > 0) {
      setPayOpen(true);
      return;
    }
    // A reinstatement charges nothing either, but this component must never be
    // the thing that decides so: it reads a removal date, the server reads the
    // period. Until the quote has landed AND says zero, an un-cancel is treated
    // exactly like an addition. Fail safe, not clever.
    if (toReinstate.length > 0 && (!quote || quote.dueNow > 0)) {
      setPayOpen(true);
      return;
    }
    formRef.current?.requestSubmit();
  }

  const showSaved = state?.ok === true && !hasDiff && !saving;

  return (
    <div className="form" style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>{tt("subjedit.title")}</h2>
      <p className="subjedit-note">{tt("plan.perSubjectHint")}</p>
      {/* HOW the billing works, in one sentence — this replaces the retired
          proration explanation ("we charge you for the days left in the
          period"), which described a model the platform no longer runs. */}
      <p className="subjedit-note">{tt("subjedit.cycleNote")}</p>

      {subjects.length === 0 ? (
        <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
      ) : (
        <>
          {/* One card per subject on the go-forward plan. */}
          <div className="splan-list">
            {plan.map((item) => {
              const s = byId.get(item.subjectId);
              if (!s) return null;
              const cur = activeById.get(item.subjectId);
              const pending = cur?.pendingInterval ?? null;
              const isLastOne = plan.length <= 1;
              return (
                <SubjectPlanCard
                  key={s.id}
                  id={s.id}
                  code={s.code}
                  name={s.name}
                  interval={item.interval}
                  prices={s.prices}
                  onIntervalChange={(id, iv) =>
                    setPlan((prev) => setPlanInterval(prev, id, iv))
                  }
                  onRemove={(id) => setPlan((prev) => removePlanSubject(prev, id))}
                  removeDisabled={isLastOne || saving}
                  removeDisabledReason={tt("subjedit.minOne")}
                  // A covered subject's CYCLE cannot move while payments are off —
                  // but REMOVAL must stay available. The server allows it (the DB
                  // gate fires on adds and cycle changes only), so disabling the
                  // whole card here contradicted it and left a paying parent in
                  // `off` mode with no action at all.
                  disabled={saving}
                  cycleDisabled={addsDisabled && !!cur}
                  loading={quoting}
                  chip={pending ? "pendingChange" : cur ? "active" : undefined}
                  // A bare cycle name ("İllik") next to a radio sitting on
                  // "Aylıq" is indistinguishable from a rendering bug — the
                  // chip has to say WHEN that cycle applies.
                  chipText={
                    pending
                      ? tt("subjedit.pendingChip").replace("{cycle}", cycleName(pending))
                      : cur
                        ? tt("subjedit.activeChip")
                        : undefined
                  }
                  locale={locale}
                  t={tt}
                />
              );
            })}
          </div>
          <p className="hint">{tt("subjedit.minOne")}</p>

          {/* Subjects that can still be added (including ones whose removal is
              already scheduled — re-adding cancels that removal). */}
          {available.length > 0 && (
            <ul className="pcfg-list" style={{ marginTop: 10 }}>
              {available.map((s) => {
                let from: { price: number; iv: PlanInterval } | null = null;
                for (const iv of PLAN_INTERVALS) {
                  const p = subjectPrice(s, iv);
                  if (p === null) continue;
                  if (!from || p < from.price) from = { price: p, iv };
                }
                return (
                  <li key={s.id} className="pcfg-row">
                    <span className="pcfg-row-main">
                      <span className="pcfg-row-name">
                        {subjectLabel(t, s.code, s.name)}
                      </span>
                      {endingById.has(s.id) && (
                        <span className="subjedit-chip-ending">
                          {tt("subjedit.endingChip")}
                        </span>
                      )}
                      <span className="pcfg-row-price">
                        {from === null
                          ? tt("cfg.unpriced")
                          : tt("plan.fromPrice")
                              .replace("{price}", formatAzn(from.price, locale))
                              .replace("{cycle}", tt(INTERVAL_LABEL_KEY[from.iv]))}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="pcfg-add"
                      // A subject being PUT BACK returns on the cycle it is
                      // still paid on, not the configurator default — otherwise
                      // an un-cancel silently drags a cycle change along with
                      // it. Same rule the server uses for a subject-ids-only
                      // caller (planBasket.derivePlanItems reads allRows).
                      onClick={() =>
                        setPlan((prev) =>
                          addPlanSubject(
                            prev,
                            s.id,
                            catalog,
                            reinstatableById.has(s.id)
                              ? effectiveCycle(reinstatableById.get(s.id)!)
                              : undefined,
                          ),
                        )
                      }
                      disabled={saving || addsDisabled}
                      title={addsDisabled ? tt("gate.paymentsOff") : undefined}
                      aria-label={tt("cfg.addAria").replace(
                        "{subject}",
                        subjectLabel(t, s.code, s.name),
                      )}
                    >
                      <span aria-hidden="true" className="pcfg-add-glyph">
                        +
                      </span>
                      {tt("cfg.add")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Structured change summary: Selected · Added · Removed · Cycle
              changes · Due now · Renewals · Note. */}
          <div className="wizard-summary subjedit-summary">
            <div className="quote-row">
              <span className="q-label">{tt("subjedit.selectedCount")}</span>
              <span>{plan.length}</span>
            </div>

            {toAdd.length > 0 && (
              <div className="subjedit-sum-block">
                <span className="subjedit-sum-label">{tt("subjedit.pendingAdd")}</span>
                <ul className="subjedit-sum-list">
                  {toAdd.map((p) => {
                    const s = byId.get(p.subjectId);
                    return (
                      <li key={p.subjectId} className="add">
                        {s ? subjectLabel(t, s.code, s.name) : p.subjectId} ·{" "}
                        {cycleName(p.interval)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* UN-CANCELS get their own block. Folding them into "Added" is
                exactly the mislabel that preceded the double charge: the
                parent is not buying anything, they are withdrawing a
                cancellation and keeping the period they already paid for. */}
            {toReinstate.length > 0 && (
              <div className="subjedit-sum-block">
                <span className="subjedit-sum-label">
                  {tt("subjedit.pendingReinstate")}
                </span>
                <ul className="subjedit-sum-list">
                  {reinstateLines().map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <p className="subjedit-note">{tt("subjedit.reinstateNote")}</p>
              </div>
            )}
            {toRemove.length > 0 && (
              <div className="subjedit-sum-block">
                <span className="subjedit-sum-label">{tt("subjedit.pendingRemove")}</span>
                <ul className="subjedit-sum-list">
                  {toRemove.map((c) => {
                    const s = byId.get(c.subjectId);
                    return (
                      <li key={c.subjectId} className="remove">
                        {s ? subjectLabel(t, s.code, s.name) : c.subjectId}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {toChangePlan.length > 0 && (
              <div className="subjedit-sum-block">
                <span className="subjedit-sum-label">
                  {tt("subjedit.pendingPlanChange")}
                </span>
                <ul className="subjedit-sum-list">
                  {toChangePlan.map((p) => {
                    const s = byId.get(p.subjectId);
                    const cur =
                      activeById.get(p.subjectId) ?? reinstatableById.get(p.subjectId);
                    return (
                      <li key={p.subjectId}>
                        {tt("subjedit.planChangeLine")
                          .replace(
                            "{subject}",
                            s ? subjectLabel(t, s.code, s.name) : p.subjectId,
                          )
                          // The cycle being LEFT is the effective one, so
                          // cancelling a schedule reads "İllik → Aylıq" rather
                          // than the meaningless "Aylıq → Aylıq".
                          .replace("{from}", cur ? cycleName(effectiveCycle(cur)) : "")
                          .replace("{to}", cycleName(p.interval))
                          .replace("{date}", fmtDate(cur?.periodEnd ?? null))}
                      </li>
                    );
                  })}
                </ul>
                <p className="subjedit-note">{tt("subjedit.planChangeNote")}</p>
              </div>
            )}

            {quoting ? (
              <p className="subjedit-note">{tt("sub.calculating")}</p>
            ) : quote ? (
              <>
                {toAdd.length > 0 && (
                  <div className="subjedit-sum-block">
                    <span className="subjedit-sum-label">{tt("subjedit.dueNow")}</span>
                    {quote.dueNow > 0 ? (
                      <>
                        <span className="subjedit-sum-amount mono">
                          {quote.dueNow} {quote.currency}
                        </span>
                        {/* WHY this amount: a full first period per added
                            subject, starting today — never a part period. */}
                        <p className="subjedit-note">{tt("subjedit.dueNowNote")}</p>
                      </>
                    ) : (
                      <p className="subjedit-note">{noChargeSentence(quote)}</p>
                    )}
                  </div>
                )}
                {toRemove.length > 0 && (
                  <div className="subjedit-sum-block">
                    <span className="subjedit-sum-label">{tt("subjedit.noteLabel")}</span>
                    {removalLines(quote).map((line, i) => (
                      <p className="subjedit-sum-line muted" key={i}>
                        {line}
                      </p>
                    ))}
                    <p className="subjedit-sum-line muted">{tt("subjedit.noteNoRefund")}</p>
                  </div>
                )}
              </>
            ) : null}

            {/* Per subject: its cycle, its price and when IT renews. Rendered
                whether or not a change is pending — with independent cycles
                this list IS the billing schedule. */}
            <div className="subjedit-sum-block">
              <span className="subjedit-sum-label">
                {tt("subjedit.perSubjectLabel")}
              </span>
              <ul className="subjedit-sum-list">
                {planRows.map((row) => (
                  <li key={row.subjectId}>
                    {row.head}
                    <span className="muted"> · {row.when}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Breakdown only: the amounts above are the server's, so this must
                not print a second, list-price "due today" beneath them. */}
            <PlanSummary
              quote={localQuote}
              server={
                quote
                  ? {
                      discountPercent: quote.discountPercent,
                      // The sibling discount ON THE DESIRED BASKET, summed from
                      // the same per-cycle groups the subtotals above come from
                      // — the RPC rounds per cycle, so re-deriving it from a
                      // percentage here could disagree by a qəpik.
                      discount: Object.values(quote.groups ?? {}).reduce(
                        (sum, g) => sum + g.discount,
                        0,
                      ),
                      dueToday: null,
                      trialDays: 0,
                      currency: quote.currency,
                      groups: quote.groups ?? null,
                    }
                  : null
              }
              loading={quoting}
              locale={locale}
              t={tt}
            />
          </div>

          {/* Hidden form: student_id + one `plan` entry per DESIRED subject and
              its cycle. The server diffs against the live subscription. */}
          <form action={formAction} ref={formRef}>
            <input type="hidden" name="student_id" value={studentId} />
            {plan.map((p) => (
              <input
                key={p.subjectId}
                type="hidden"
                name="plan"
                value={`${p.subjectId}:${p.interval}`}
              />
            ))}
            <div className="subjedit-actions">
              <button
                type="button"
                className="btn"
                onClick={onSaveClick}
                disabled={!hasDiff || saving}
                title={!hasDiff ? tt("subjedit.noChanges") : undefined}
              >
                {saving ? tt("subjedit.saving") : tt("subjedit.save")}
              </button>
            </div>
          </form>

          {state && state.ok === false && <p className="form-error">{state.error}</p>}
          {showSaved && <p className="subjedit-success">{tt("subjedit.saved")}</p>}

          {/* Payment-first confirmation for additions. Confirm is the ONLY path
              that submits the apply action; cancel/close keeps the selection and
              applies nothing. */}
          <PlanChangeConfirmModal
            isOpen={payOpen}
            quote={
              !quoting && quote
                ? {
                    dueNowLabel: `${quote.dueNow} ${quote.currency}`,
                    // What the money buys, in one sentence: a full first period
                    // per added subject, starting today. When the sheet opened
                    // for an UN-CANCEL that the quote has since priced at zero,
                    // say THAT instead — "no charge now, first payment on
                    // {date}" describes a trial, not a subject that keeps
                    // running on the period it already paid for.
                    thenLabel:
                      quote.dueNow > 0
                        ? tt("subjedit.dueNowNote")
                        : toAdd.length === 0 && toReinstate.length > 0
                          ? tt("subjedit.reinstateNote")
                          : noChargeSentence(quote),
                    // One line per subject BEING PAID FOR (plus any un-cancel
                    // that opened this sheet) — the subjects already on the plan
                    // are untouched by this charge and listing their renewals
                    // here would suggest otherwise.
                    lines: planRows
                      .filter(
                        (row) =>
                          addedIds.has(row.subjectId) || reinstatedIds.has(row.subjectId),
                      )
                      .map((row) => ({ label: row.head, value: row.when })),
                    noCharge: quote.dueNow <= 0,
                  }
                : null
            }
            pending={saving}
            onConfirm={() => {
              setPayOpen(false);
              formRef.current?.requestSubmit();
            }}
            onCancel={() => setPayOpen(false)}
            dict={dict}
          />
        </>
      )}
    </div>
  );
}
