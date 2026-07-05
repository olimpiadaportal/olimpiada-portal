"use client";

// D2/R11 — Add-Child WIZARD (new-child flow). A single client wizard that
// drives the whole "create child → pick subjects → pick plan → payment →
// reveal 8-digit ID" journey WITHOUT navigating away between steps.
//
// R11: the wizard is PAYMENT-MODE aware. The server page resolves the mode
// (getPaymentModeInfo, server-only) and passes it down; the wizard only picks
// which steps exist — every price/discount/grant stays server-authoritative.
//
//   mode 'real' | 'demo' — the full 5-step flow:
//     1. INFO     — name, city, school (filtered to city), grade, password.
//                   "Next" calls the addChild server action (creates the child,
//                   NO login ID yet) and stores the returned studentProfileId.
//     2. SUBJECTS — per-subject pricing checkboxes (≥1 required).
//     3. PLAN     — modern plan CARDS (Weekly/Monthly/Yearly, subscription-page
//                   contract classes) + a LIVE server quote (sibling discount).
//     4. PAYMENT  — the DEMO card form (cosmetic, never charged). "Pay" calls
//                   subscribeChild, which allocates + reveals the 8-digit ID.
//                   NOTE: the future real provider replaces the SERVER seam
//                   inside subscribeChild (webhook-verified charge) — this UI
//                   step stays as the card-entry surface in both modes.
//     5. DONE     — success + the allocated login ID + a link to /dashboard.
//
//   mode 'giveaway' — TWO steps (Info → Done): after addChild succeeds the
//     same transition calls activateChildGiveaway (grants free access and
//     allocates/reveals the 8-digit ID immediately). No subjects/plan/payment.
//
//   mode 'off' — TWO steps (Info → Done): the child is still created (ID stays
//     pending), then a notice step shows gate.paymentsOff + a dashboard link
//     (the dashboard already renders "ID pending — choose a plan").
//
// All amounts/discounts are computed server-side (quoteSubscription /
// subscribeChild). The demo card fields are NOT validated against any processor.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { addChild } from "@/lib/auth/parentService";
import {
  subscribeChild,
  quoteSubscription,
  activateChildGiveaway,
  type QuoteResult,
} from "@/lib/auth/subscriptionService";

type City = { id: string; name: string };
type School = {
  id: string;
  name: string;
  district_id: string | null;
  is_private?: boolean;
  school_number?: number | null;
};
type Grade = { id: string; level: number; name: string };
type Subj = { id: string; name: string; prices: Record<string, number> };

type StepId = "info" | "subjects" | "plan" | "payment" | "done";

const STEP_KEY: Record<StepId, string> = {
  info: "addchild.step.info",
  subjects: "addchild.step.subjects",
  plan: "addchild.step.plan",
  payment: "addchild.step.payment",
  done: "addchild.step.done",
};

// Ordered steps per payment mode. Unknown/missing mode falls back to the full
// flow ('real') — the server actions still gate every mutation authoritatively.
const FLOWS: Record<string, StepId[]> = {
  real: ["info", "subjects", "plan", "payment", "done"],
  demo: ["info", "subjects", "plan", "payment", "done"],
  giveaway: ["info", "done"],
  off: ["info", "done"],
};

const INTERVAL_KEY: Record<string, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

// Plan-card copy per interval — reuses the public pricing / billing keys so the
// wizard cards read exactly like the Subscription page cards.
const PLAN_META: Record<string, { perKey: string; noteKey: string }> = {
  week: { perKey: "billing.perWeek", noteKey: "pricing.plan.weekly.note" },
  month: { perKey: "billing.perMonth", noteKey: "pricing.plan.monthly.note" },
  year: { perKey: "billing.perYear", noteKey: "pricing.plan.yearly.note" },
};

const INTERVALS = ["week", "month", "year"] as const;

export function AddChildWizard({
  cities,
  schools,
  grades,
  subjects,
  dict,
  paymentMode,
}: {
  cities: City[];
  schools: School[];
  grades: Grade[];
  subjects: Subj[];
  dict: Record<string, string>;
  /** Server-resolved payment mode: 'real' | 'demo' | 'giveaway' | 'off'. */
  paymentMode: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  // Same fallback chain the Subscription page uses for the popular badge:
  // skip keys the dict doesn't resolve (getT returns the key itself when a
  // key is missing, so `v === k` means "not translated").
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = dict[k];
      if (v && v !== k) return v;
    }
    return "";
  };
  const popularBadge = pick(
    "pricing2.badge.popular",
    "pricing2.popular",
    "pricing2.mostPopular",
    "billing.popular",
  );

  const flow: StepId[] = FLOWS[paymentMode] ?? FLOWS.real;

  // stepIdx indexes into `flow`; `cur` is the step being rendered. Only steps
  // present in the mode's flow are ever reachable.
  const [stepIdx, setStepIdx] = useState(0);
  const cur: StepId = flow[Math.min(stepIdx, flow.length - 1)];
  const [pending, startTransition] = useTransition();

  // Step 1 — info.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [infoErrors, setInfoErrors] = useState<string[]>([]);
  // The created child's profile id (returned by addChild; used by
  // subscribeChild / activateChildGiveaway).
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);

  // Step 2 — subjects.
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Step 3 — plan + live quote.
  const [interval, setIntervalState] = useState("month");
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // Step 4 — demo payment + the result.
  const [payError, setPayError] = useState<string | null>(null);
  const [childUniqueId, setChildUniqueId] = useState<string | null>(null);

  // Schools available for the chosen city (filtered client-side by district_id).
  const citySchools = districtId
    ? schools.filter((s) => s.district_id === districtId)
    : [];

  // Live, AUTHORITATIVE quote whenever the plan step inputs change.
  useEffect(() => {
    if (cur !== "plan" || !studentProfileId) return;
    const ids = Array.from(sel);
    if (ids.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    // Drop a stale quote (fetched for another interval/subject set) so the
    // selected card falls back to the honest client estimate while refetching.
    setQuote(null);
    quoteSubscription({ studentId: studentProfileId, interval, subjectIds: ids }).then(
      (q) => {
        if (!cancelled) setQuote(q);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cur, studentProfileId, sel, interval]);

  function toggleSubject(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // STEP "info" → create the child (no login ID yet) and advance. In giveaway
  // mode the SAME transition then grants free access + reveals the 8-digit ID.
  function submitInfo() {
    setInfoErrors([]);
    // Cheap client-side guards mirror the server validation (so we never call the
    // action with obviously empty fields); the server re-validates authoritatively.
    const local: string[] = [];
    if (!firstName.trim()) local.push("auth.child.err.firstNameRequired");
    if (!lastName.trim()) local.push("auth.child.err.lastNameRequired");
    if (!districtId) local.push("addchild.err.cityRequired");
    if (!schoolId) local.push("addchild.err.schoolRequired");
    if (!gradeId) local.push("addchild.err.gradeRequired");
    if (local.length) {
      setInfoErrors(local);
      return;
    }

    const fd = new FormData();
    fd.set("first_name", firstName.trim());
    fd.set("last_name", lastName.trim());
    fd.set("district_id", districtId);
    fd.set("school_id", schoolId);
    fd.set("grade_id", gradeId);
    // Display fallbacks (the DB also stores free-text city/school/grade label).
    fd.set("city", cities.find((c) => c.id === districtId)?.name ?? "");
    fd.set("school_name", citySchools.find((s) => s.id === schoolId)?.name ?? "");
    const g = grades.find((x) => x.id === gradeId);
    fd.set("class_grade", g ? g.name : "");
    // Password is read from the form field by name.
    const pw = (document.getElementById("child-password") as HTMLInputElement | null)?.value ?? "";
    fd.set("password", pw);

    startTransition(async () => {
      // The child may already exist (e.g. a giveaway activation failed on the
      // previous try, or the parent stepped Back) — never create a duplicate.
      let sid = studentProfileId;
      if (!sid) {
        const res = await addChild(null, fd);
        if (!res?.ok || !res.studentProfileId) {
          setInfoErrors(res?.errors ?? ["auth.child.err.createFailed"]);
          return; // stay on the info step; entered data preserved.
        }
        sid = res.studentProfileId;
        setStudentProfileId(sid);
      }

      if (paymentMode === "giveaway") {
        // Free-access grant + 8-digit ID allocation, server-verified (the
        // action re-checks ownership AND that the giveaway window is live).
        const gfd = new FormData();
        gfd.set("student_id", sid);
        const grant = await activateChildGiveaway(null, gfd);
        if (!grant?.ok) {
          // Already-translated message; tt() passes unknown strings through.
          setInfoErrors([grant?.error ?? "sub.err.invalid"]);
          return; // child exists — "Next" retries the activation only.
        }
        setChildUniqueId(grant.childUniqueId ?? null);
      }

      setStepIdx(1); // → subjects (real/demo) or done (giveaway/off).
    });
  }

  // STEP "payment" → confirm the demo payment: allocate the 8-digit ID, then
  // reveal it. (A real provider replaces the server seam inside subscribeChild —
  // webhook-verified activation — not this UI step.)
  function confirmPayment() {
    if (!studentProfileId) return;
    setPayError(null);
    const fd = new FormData();
    fd.set("student_id", studentProfileId);
    fd.set("interval", interval);
    for (const id of sel) fd.append("subject", id);

    startTransition(async () => {
      const res = await subscribeChild(null, fd);
      if (!res?.ok) {
        setPayError(res?.error ?? tt("sub.err.invalid"));
        return;
      }
      setChildUniqueId(res.result?.childUniqueId ?? null);
      setStepIdx(flow.length - 1);
    });
  }

  // Client-side ESTIMATE (subjects × per-interval price) — shown until the
  // authoritative server quote arrives for the selected interval.
  const intervalTotal = (iv: string) =>
    Array.from(sel).reduce(
      (sum, id) => sum + (subjects.find((s) => s.id === id)?.prices[iv] ?? 0),
      0,
    );
  const subtotal = intervalTotal(interval);

  return (
    <div className="wizard">
      {/* Progress indicator — only the current mode's steps. */}
      <div className="wizard-steps">
        {flow.map((id, i) => (
          <span
            key={id}
            className={`wizard-step${i === stepIdx ? " active" : ""}${i < stepIdx ? " done" : ""}`}
          >
            {tt(STEP_KEY[id])}
          </span>
        ))}
      </div>

      <div className="wizard-body">
        {/* ============================ STEP — INFO ============================ */}
        {cur === "info" && (
          <div className="form">
            <label className="field">
              <span className="field-label">{tt("parent.child.first")} *</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{tt("parent.child.last")} *</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span className="field-label">{tt("addchild.field.city")} *</span>
              <select
                value={districtId}
                onChange={(e) => {
                  setDistrictId(e.target.value);
                  setSchoolId(""); // reset school when city changes
                }}
                required
              >
                <option value="">{tt("addchild.field.selectCity")}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{tt("addchild.field.school")} *</span>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={!districtId}
                required
              >
                <option value="">
                  {districtId
                    ? tt("addchild.field.selectSchool")
                    : tt("addchild.field.cityFirst")}
                </option>
                {/* Private schools first (their own group), then public — the
                    server already ordered each group (numeric school no. asc). */}
                {citySchools.some((s) => s.is_private) && (
                  <optgroup label={tt("addchild.field.privateSchools")}>
                    {citySchools
                      .filter((s) => s.is_private)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                {citySchools.some((s) => !s.is_private) &&
                  (citySchools.some((s) => s.is_private) ? (
                    <optgroup label={tt("addchild.field.publicSchools")}>
                      {citySchools
                        .filter((s) => !s.is_private)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  ) : (
                    // No private schools in this city → flat list (no group header).
                    citySchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{tt("addchild.field.grade")} *</span>
              <select
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
                required
              >
                <option value="">{tt("addchild.field.selectGrade")}</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.level} — {g.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{tt("parent.child.password")} *</span>
              <PasswordInput
                id="child-password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                className=""
                showLabel={tt("auth.showPassword")}
                hideLabel={tt("auth.hidePassword")}
              />
            </label>
            <p className="hint">{tt("parent.child.passwordHint")}</p>

            {infoErrors.length > 0 && (
              <ul className="form-error">
                {infoErrors.map((e, i) => (
                  <li key={i}>{tt(e)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ========================= STEP — SUBJECTS ========================= */}
        {cur === "subjects" && (
          <div className="form">
            <span className="field-label">{tt("sub.subjects")}</span>
            {subjects.length === 0 ? (
              <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
            ) : (
              subjects.map((s) => (
                <label
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 0",
                  }}
                >
                  <span>
                    <input
                      type="checkbox"
                      checked={sel.has(s.id)}
                      onChange={() => toggleSubject(s.id)}
                    />{" "}
                    {s.name}
                  </span>
                  <span className="muted">{s.prices[interval] ?? "—"} AZN</span>
                </label>
              ))
            )}
          </div>
        )}

        {/* =========================== STEP — PLAN =========================== */}
        {/* R11: modern selectable plan CARDS (subscription-page contract classes).
            Each card = a real <button> (keyboard: Tab + Enter/Space; state via
            aria-pressed). Prices shown per card are the client estimate for the
            CURRENT subject selection; the selected card switches to the live
            server quote (sibling discount included) as soon as it arrives. */}
        {cur === "plan" && (
          <div className="wiz-plan-step">
            <span className="field-label">{tt("sub.interval")}</span>
            <div
              className="plans-grid wiz-plans"
              role="group"
              aria-label={tt("sub.interval")}
            >
              {INTERVALS.map((iv) => {
                const selected = interval === iv;
                const isPopular = iv === "month";
                const amount =
                  selected && quote && quote.ok ? quote.total : intervalTotal(iv);
                const currency =
                  selected && quote && quote.ok ? quote.currency : "AZN";
                return (
                  <button
                    key={iv}
                    type="button"
                    className={`plan-card wiz-plan-card${selected ? " featured" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setIntervalState(iv)}
                    disabled={pending}
                  >
                    {isPopular && popularBadge !== "" && (
                      <span className="plan-badge">{popularBadge}</span>
                    )}
                    <span
                      className={`wiz-plan-check${selected ? " on" : ""}`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className="plan-name">{tt(INTERVAL_KEY[iv])}</span>
                    <span className="plan-price">
                      {amount} {currency}
                    </span>
                    <span className="plan-per">{tt(PLAN_META[iv].perKey)}</span>
                    <span className="plan-desc">{tt(PLAN_META[iv].noteKey)}</span>
                  </button>
                );
              })}
            </div>

            {/* Server-authoritative quote summary (unchanged contract). */}
            <div className="wizard-summary">
              <div className="quote-row">
                <span className="q-label">{tt("pay.subtotal")}</span>
                <span>
                  {quote && quote.ok ? quote.base : subtotal}{" "}
                  {quote && quote.ok ? quote.currency : "AZN"}
                </span>
              </div>
              <div className="quote-row">
                <span className="q-label">{tt("pay.discount")}</span>
                <span>
                  {quote && quote.ok && quote.discount_percent > 0
                    ? `−${quote.discount_percent}% (−${quote.discount} ${quote.currency})`
                    : `0%`}
                </span>
              </div>
              <div className="quote-total">
                <span>{tt("pay.total")}</span>
                <span>
                  {quote && quote.ok ? quote.total : subtotal}{" "}
                  {quote && quote.ok ? quote.currency : "AZN"} / {tt(INTERVAL_KEY[interval])}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================= STEP — PAYMENT ========================= */}
        {cur === "payment" && (
          <div className="pay-card">
            <span className="pay-demo-badge">{tt("pay.demoBadge")}</span>
            <h2 style={{ margin: "12px 0 4px" }}>{tt("pay.title")}</h2>
            <p className="muted">{tt("pay.note")}</p>

            <div className="pay-field">
              <span className="field-label">{tt("pay.cardName")}</span>
              <input type="text" autoComplete="off" placeholder="Ad Soyad" />
            </div>
            <div className="pay-field">
              <span className="field-label">{tt("pay.cardNumber")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="4242 4242 4242 4242"
              />
            </div>
            <div className="pay-grid">
              <div className="pay-field">
                <span className="field-label">{tt("pay.expiry")}</span>
                <input type="text" autoComplete="off" placeholder="MM/YY" />
              </div>
              <div className="pay-field">
                <span className="field-label">{tt("pay.cvc")}</span>
                <input type="text" inputMode="numeric" autoComplete="off" placeholder="123" />
              </div>
            </div>

            <div className="wizard-summary" style={{ marginTop: 18 }}>
              <div className="quote-total">
                <span>{tt("pay.total")}</span>
                <span>
                  {quote && quote.ok ? quote.total : subtotal}{" "}
                  {quote && quote.ok ? quote.currency : "AZN"} / {tt(INTERVAL_KEY[interval])}
                </span>
              </div>
            </div>

            {payError && <p className="form-error">{payError}</p>}
          </div>
        )}

        {/* =========================== STEP — DONE =========================== */}
        {cur === "done" && (
          <div className="card wiz-done">
            {paymentMode === "off" ? (
              // Payments disabled: the child exists, the ID stays pending (the
              // dashboard shows "ID pending — choose a plan").
              <>
                <p>
                  <strong>{tt("gate.paymentsOff")}</strong>
                </p>
                <div className="site-cta wiz-done-cta">
                  <Link className="btn" href="/dashboard">
                    {tt("parent.dash.title")}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p>
                  <strong>
                    {paymentMode === "giveaway"
                      ? tt("addchild.giveawayGranted")
                      : tt("pay.success")}
                  </strong>
                </p>
                <p className="muted">{tt("pay.idRevealed")}</p>
                {childUniqueId && (
                  <p className="wiz-id">
                    <code>{childUniqueId}</code>
                  </p>
                )}
                <p className="muted">{tt("parent.child.idNote")}</p>
                <div className="site-cta wiz-done-cta">
                  <Link className="btn" href="/dashboard">
                    {tt("parent.dash.title")}
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions (hidden on the final DONE step). */}
      {cur !== "done" && (
        <div className="wizard-actions">
          {stepIdx > 0 ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
              disabled={pending}
            >
              {tt("addchild.back")}
            </button>
          ) : (
            <span />
          )}

          {cur === "info" && (
            <button type="button" className="btn" onClick={submitInfo} disabled={pending}>
              {pending
                ? tt("parent.child.submitting")
                : flow.length === 2
                  ? tt("addchild.createChild")
                  : tt("addchild.next")}
            </button>
          )}
          {cur === "subjects" && (
            <button
              type="button"
              className="btn"
              onClick={() => setStepIdx(2)}
              disabled={pending || sel.size === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {cur === "plan" && (
            <button
              type="button"
              className="btn"
              onClick={() => setStepIdx(3)}
              disabled={pending || sel.size === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {cur === "payment" && (
            <button
              type="button"
              className="btn"
              onClick={confirmPayment}
              disabled={pending || sel.size === 0}
            >
              {pending ? tt("pay.processing") : tt("pay.payNow")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
