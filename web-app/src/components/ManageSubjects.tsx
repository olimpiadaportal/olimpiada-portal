"use client";

// MANAGE SUBJECTS — the editor for a child's LIVE subscription.
//
// Migration 109 turned this into a per-subject PLAN editor: every covered
// subject carries its own billing cycle, so the parent can add a subject,
// remove one, or move one subject to another cycle without touching the rest.
// The old single subscription-level `interval` prop is gone — one cycle for the
// whole plan is no longer true in the database and cannot be true here.
//
// PAYMENT-FIRST contract (owner requirement), now three-way:
//   * ANY ADDITION (including a mixed diff) opens the payment sheet
//     (DemoPaymentModal) BEFORE the apply, in BOTH 'demo' and 'real' modes —
//     there is no provider yet and the real charge seam is server-side.
//   * A REMOVAL-ONLY diff submits directly: nothing is charged, access runs to
//     that subject's own period end and no refund is ever made.
//   * A CYCLE-CHANGE-ONLY diff also submits directly. It is SCHEDULED into
//     pending_interval and takes effect at that subject's next renewal, so
//     there is nothing to charge now and a payment sheet would be a lie.
//
// The SERVER receives the DESIRED FULL set (subject + cycle) and derives the
// adds / removes / cycle changes itself — ownership recheck, payment-mode gate
// and every amount are server-side; the client never sends a price.
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  quoteSubjectChange,
  updateSubscriptionSubjectsAction,
  type SubjectChangeQuote,
  type SubjectsUpdateState,
} from "@/lib/auth/subscriptionService";
import { DemoPaymentModal } from "@/components/DemoPaymentModal";
import { PlanSummary } from "@/components/PlanSummary";
import { SubjectPlanCard } from "@/components/SubjectPlanCard";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatLongDate } from "@/lib/formatDate";
import { subjectLabel } from "@/lib/subjectLabel";
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
   * Server-resolved payment mode. "real" | "demo" → full editor. "off" →
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

  // Three-way diff. A cycle change is a real change even though the subject set
  // is identical — without it the "no changes" state would swallow it.
  const { toAdd, toRemove, toChangePlan } = useMemo(() => {
    const inPlan = new Set(plan.map((p) => p.subjectId));
    return {
      toAdd: plan.filter((p) => !activeById.has(p.subjectId)),
      toRemove: active.filter((c) => !inPlan.has(c.subjectId)),
      // Compared against the EFFECTIVE cycle (a scheduled change wins), so
      // re-selecting the cycle the subject is actually paid on registers as a
      // change and CANCELS the schedule. Comparing against `interval` alone
      // meant a parent who mis-clicked "yearly" got hasDiff === false and a
      // disabled Save — locked into the mistake with no way back.
      toChangePlan: plan.filter((p) => {
        const cur = activeById.get(p.subjectId);
        return !!cur && effectiveCycle(cur) !== p.interval;
      }),
    };
  }, [plan, active, activeById, effectiveCycle]);
  const hasDiff = toAdd.length > 0 || toRemove.length > 0 || toChangePlan.length > 0;
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

  const noChargeSentence = (q: SubjectChangeQuote) =>
    tt("subjedit.noChargeNow").replace("{date}", fmtDate(q.effectiveFrom));
  // ONE LINE PER REMOVED SUBJECT, each with ITS OWN period end. The single
  // `removalsEffectiveAt` scalar is the subscription minimum, so dropping a
  // yearly subject from a plan that also holds a weekly one told the parent
  // access ended in 7 days while the database granted a year.
  const removalLines = (q: SubjectChangeQuote): string[] =>
    (q.removals ?? []).map((r) => {
      const s = byId.get(r.subject_id);
      return tt("subjedit.noteLine")
        .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : r.subject_id)
        .replace("{date}", fmtDate(r.remove_at));
    });
  const cycleName = (iv: string) =>
    isPlanInterval(iv) ? tt(INTERVAL_LABEL_KEY[iv]) : iv;
  // Per-cycle renewal sentences replace the single "{total} {currency} /
  // {interval}" line — one sentence cannot express mixed cycles.
  const renewalLines = (q: SubjectChangeQuote): string[] =>
    (q.renewals ?? []).map((r) =>
      tt(
        `plan.renewalLine.${
          r.interval === "week" ? "weekly" : r.interval === "year" ? "yearly" : "monthly"
        }`,
      )
        .replace("{total}", String(r.total))
        .replace("{currency}", q.currency),
    );

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
    // PAYMENT-FIRST: only an ADDITION costs money now. A scheduled cycle change
    // and a removal both charge nothing, so they submit directly.
    if (toAdd.length > 0) {
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
                  // A covered subject's cycle cannot move while payments are off.
                  disabled={saving || (addsDisabled && !!cur)}
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
                      onClick={() => setPlan((prev) => addPlanSubject(prev, s.id, catalog))}
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
                    const cur = activeById.get(p.subjectId);
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
                      <span className="subjedit-sum-amount mono">
                        {quote.dueNow} {quote.currency}
                      </span>
                    ) : (
                      <p className="subjedit-note">{noChargeSentence(quote)}</p>
                    )}
                  </div>
                )}
                {/* Renewals: one sentence per cycle — no invented combined rate. */}
                <div className="subjedit-sum-block">
                  <span className="subjedit-sum-label">{tt("plan.renewals")}</span>
                  {renewalLines(quote).map((line, i) => (
                    <p className="subjedit-sum-line" key={i}>
                      {line}
                    </p>
                  ))}
                </div>
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
              {paymentMode === "demo" && (
                <p className="subjedit-mode-note">{tt("subjedit.demoModeNote")}</p>
              )}
            </div>
          </form>

          {state && state.ok === false && <p className="form-error">{state.error}</p>}
          {showSaved && <p className="subjedit-success">{tt("subjedit.saved")}</p>}

          {/* Payment-first sheet for additions ('demo' AND 'real' — no provider
              yet). Confirm is the ONLY path that submits the apply action;
              cancel/close keeps the selection and applies nothing. */}
          <DemoPaymentModal
            isOpen={payOpen}
            quote={
              !quoting && quote
                ? {
                    dueNowLabel: `${quote.dueNow} ${quote.currency}`,
                    thenLabel:
                      quote.dueNow > 0
                        ? (renewalLines(quote)[0] ?? "")
                        : noChargeSentence(quote),
                    lines: renewalLines(quote).map((value) => ({
                      label: tt("plan.renewals"),
                      value,
                    })),
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
