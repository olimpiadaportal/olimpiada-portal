"use client";

// D2 — Add-Child WIZARD (new-child flow). A single 5-step client wizard that
// drives the whole "create child → pick subjects → pick plan → demo payment →
// reveal 8-digit ID" journey WITHOUT navigating away between steps.
//
//   1. INFO     — name, city, school (filtered to city), grade, child password.
//                 "Next" calls the addChild server action (creates the child,
//                 NO login ID yet) and stores the returned studentProfileId.
//   2. SUBJECTS — per-subject pricing checkboxes (≥1 required).
//   3. PLAN     — billing interval + a LIVE server quote (sibling discount).
//   4. PAYMENT  — a DEMO card form (cosmetic, never charged). "Pay" calls
//                 subscribeChild, which allocates + reveals the 8-digit ID.
//   5. DONE     — success + the allocated login ID + a link back to /dashboard.
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
  type QuoteResult,
} from "@/lib/auth/subscriptionService";

type City = { id: string; name: string };
type School = { id: string; name: string; district_id: string | null };
type Grade = { id: string; level: number; name: string };
type Subj = { id: string; name: string; prices: Record<string, number> };

const STEP_KEYS = [
  "addchild.step.info",
  "addchild.step.subjects",
  "addchild.step.plan",
  "addchild.step.payment",
  "addchild.step.done",
] as const;

const INTERVAL_KEY: Record<string, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

export function AddChildWizard({
  cities,
  schools,
  grades,
  subjects,
  dict,
}: {
  cities: City[];
  schools: School[];
  grades: Grade[];
  subjects: Subj[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  // step: 0..4 → INFO, SUBJECTS, PLAN, PAYMENT, DONE.
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Step 1 — info.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [infoErrors, setInfoErrors] = useState<string[]>([]);
  // The created child's profile id (returned by addChild; used by subscribeChild).
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
    if (step !== 2 || !studentProfileId) return;
    const ids = Array.from(sel);
    if (ids.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    quoteSubscription({ studentId: studentProfileId, interval, subjectIds: ids }).then(
      (q) => {
        if (!cancelled) setQuote(q);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, studentProfileId, sel, interval]);

  function toggleSubject(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // STEP 1 → create the child (no login ID yet) and advance.
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
      const res = await addChild(null, fd);
      if (!res?.ok || !res.studentProfileId) {
        setInfoErrors(res?.errors ?? ["auth.child.err.createFailed"]);
        return; // stay on step 1; entered data preserved.
      }
      setStudentProfileId(res.studentProfileId);
      setStep(1);
    });
  }

  // STEP 4 → confirm the demo payment: allocate the 8-digit ID, then reveal it.
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
      setStep(4);
    });
  }

  const subtotal = Array.from(sel).reduce(
    (sum, id) => sum + (subjects.find((s) => s.id === id)?.prices[interval] ?? 0),
    0,
  );

  return (
    <div className="wizard">
      {/* Progress indicator. */}
      <div className="wizard-steps">
        {STEP_KEYS.map((k, i) => (
          <span
            key={k}
            className={`wizard-step${i === step ? " active" : ""}${i < step ? " done" : ""}`}
          >
            {tt(k)}
          </span>
        ))}
      </div>

      <div className="wizard-body">
        {/* ============================ STEP 1 — INFO ============================ */}
        {step === 0 && (
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
                {citySchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
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

        {/* ========================= STEP 2 — SUBJECTS ========================= */}
        {step === 1 && (
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

        {/* =========================== STEP 3 — PLAN =========================== */}
        {step === 2 && (
          <div className="form">
            <span className="field-label">{tt("sub.interval")}</span>
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              {["week", "month", "year"].map((iv) => (
                <label key={iv} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="interval_choice"
                    value={iv}
                    checked={interval === iv}
                    onChange={() => setIntervalState(iv)}
                  />
                  {tt(INTERVAL_KEY[iv])}
                </label>
              ))}
            </div>

            <div className="wizard-summary">
              <div className="quote-row">
                <span className="q-label">{tt("pay.subtotal")}</span>
                <span>
                  {quote && quote.ok ? quote.base : subtotal} {quote && quote.ok ? quote.currency : "AZN"}
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

        {/* ========================= STEP 4 — PAYMENT ========================= */}
        {step === 3 && (
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

        {/* =========================== STEP 5 — DONE =========================== */}
        {step === 4 && (
          <div className="card">
            <p>
              <strong>{tt("pay.success")}</strong>
            </p>
            <p className="muted">{tt("pay.idRevealed")}</p>
            {childUniqueId && (
              <p
                style={{
                  fontSize: "2rem",
                  fontWeight: 700,
                  letterSpacing: "3px",
                  margin: "12px 0",
                }}
              >
                <code>{childUniqueId}</code>
              </p>
            )}
            <p className="muted">{tt("parent.child.idNote")}</p>
            <div className="site-cta" style={{ marginTop: 12 }}>
              <Link className="btn" href="/dashboard">
                {tt("parent.dash.title")}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Actions (hidden on the final DONE step). */}
      {step < 4 && (
        <div className="wizard-actions">
          {step > 0 && step < 4 ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={pending}
            >
              {tt("addchild.back")}
            </button>
          ) : (
            <span />
          )}

          {step === 0 && (
            <button type="button" className="btn" onClick={submitInfo} disabled={pending}>
              {pending ? tt("parent.child.submitting") : tt("addchild.next")}
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="btn"
              onClick={() => setStep(2)}
              disabled={pending || sel.size === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="btn"
              onClick={() => setStep(3)}
              disabled={pending || sel.size === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {step === 3 && (
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
