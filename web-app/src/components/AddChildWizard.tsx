"use client";

// D2/R11 — Add-Child WIZARD (new-child flow). A single client wizard that
// drives the whole "create child → pick subjects → pick plan → payment →
// reveal 8-digit ID" journey WITHOUT navigating away between steps.
//
// R11: the wizard is PAYMENT-MODE aware. The server page resolves the mode
// (getPaymentModeInfo, server-only) and passes it down; the wizard only picks
// which steps exist — every price/discount/grant stays server-authoritative.
//
//   mode 'real' — the full 5-step flow:
//     1. INFO     — name, city, school (filtered to city), grade, password.
//                   "Next" calls the addChild server action (creates the child,
//                   NO login ID yet) and stores the returned studentProfileId.
//     2. SUBJECTS — pick the subjects AND give each one its own billing cycle
//                   (≥1 required). Migration 109 moved the cycle here, per
//                   subject; there is no global cycle control any more.
//     3. PLAN     — REVIEW: the grouped per-cycle breakdown + a LIVE server
//                   quote (sibling discount).
//     4. CONFIRM  — the authoritative DUE-TODAY total and one honest button.
//                   Migration 126 inverted this step the way 125 inverted
//                   Manage-Subjects: it used to say "İndi ödə" / "Pay now",
//                   charge nothing, apply the plan, and only THEN reveal the
//                   real departure button underneath — so the parent was asked
//                   to pay twice for one plan and the first ask was a lie. The
//                   button now says what happens: "continue to payment" when
//                   something is due (subscribeChild opens the intent and hands
//                   back a SIGNED redirect; nothing is applied until the bank
//                   confirms it), and "confirm" when the plan rides a trial and
//                   nothing is charged. The amount printed here is the server's
//                   `due_now` — the same number the gateway is asked for (audit
//                   invariant H7) — never the plan total, which is a DIFFERENT
//                   number whenever a trial applies. There are NO card fields:
//                   the cardholder types the PAN on the acquirer's own page.
//     5. DONE     — success + the allocated login ID + a link to /dashboard.
//
//   mode 'giveaway' — TWO steps (Info → Done): after addChild succeeds the
//     same transition calls activateChildGiveaway (grants free access and
//     allocates/reveals the 8-digit ID immediately). No subjects/plan/payment.
//     H8: an ACTIVE parent free-access window (freeAccessActive prop, server-
//     resolved) takes the SAME two-step free path — the server action re-checks
//     that a free window really covers the child before allocating the ID.
//
//   mode 'off' — TWO steps (Info → Done): the child is still created (ID stays
//     pending), then a notice step shows gate.paymentsOff + a dashboard link
//     (the dashboard already renders "ID pending — choose a plan").
//
// All amounts/discounts are computed server-side (quoteSubscription /
// subscribeChild); this component never computes or sends a price.

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import {
  ChildAvatarPicker,
  type ChildAvatarChoice,
} from "@/components/ChildAvatarPicker";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { addChild } from "@/lib/auth/parentService";
import { saveChildAvatar } from "@/lib/auth/childAvatarActions";
import {
  subscribeChild,
  quoteSubscription,
  activateChildGiveaway,
  type PlanCheckout,
  type QuoteResult,
} from "@/lib/auth/subscriptionService";
import { CheckoutRedirect } from "@/components/CheckoutRedirect";
import { CopyableId } from "@/components/CopyableId";
import { PlanSummary } from "@/components/PlanSummary";
import { SubjectPlanCard } from "@/components/SubjectPlanCard";
import {
  addPlanSubject,
  availableSubjects,
  computePlanQuote,
  DEFAULT_PLAN_INTERVAL,
  formatAzn,
  INTERVAL_LABEL_KEY,
  isPlanInterval,
  normalizePlan,
  PLAN_INTERVALS,
  removePlanSubject,
  setPlanInterval,
  subjectPrice,
  type ConfiguratorSubject,
  type PlanInterval,
  type PlanItem,
} from "@/lib/pricingConfigurator";

type City = { id: string; name: string };
// NAMING (Round 21): `districts` is the CITIES table (historic naming) —
// School.district_id and the `districtId` state mean the CITY. The real
// intra-city district (rayon) is `city_districts` / School.city_district_id /
// the `cityDistrictId` state, stored as students.city_district_id.
type CityDistrict = { id: string; name: string; city_id: string };
type School = {
  id: string;
  name: string;
  district_id: string | null;
  city_district_id?: string | null;
  is_private?: boolean;
  school_number?: number | null;
};
type Grade = { id: string; level: number; name: string };
type Subj = { id: string; code: string | null; name: string; prices: Record<string, number> };

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
  giveaway: ["info", "done"],
  off: ["info", "done"],
};

export function AddChildWizard({
  cities,
  cityDistricts,
  schools,
  grades,
  subjects,
  dict,
  paymentMode,
  freeAccessActive = false,
  initialPlan,
  initialSubjectIds = [],
  initialInterval = "month",
}: {
  cities: City[];
  cityDistricts: CityDistrict[];
  schools: School[];
  grades: Grade[];
  subjects: Subj[];
  dict: Record<string, string>;
  /** Server-resolved payment mode: 'real' | 'giveaway' | 'off'. */
  paymentMode: string;
  /** H8: server-resolved active free-access window for this parent. */
  freeAccessActive?: boolean;
  /**
   * PRESELECTION handed off from the public /services configurator
   * (`?plan=<uuid>:<cycle>,…`), already validated server-side against this same
   * `subjects` catalog. Purely a UX convenience: the parent can still change
   * everything, and subscribeChild re-validates and re-prices authoritatively.
   */
  initialPlan?: PlanItem[];
  /**
   * Legacy `?subjects=…&interval=…` hand-off, still accepted so a stale
   * bookmarked link keeps preselecting. Ignored when `initialPlan` is given.
   */
  initialSubjectIds?: string[];
  initialInterval?: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const locale = useLocale();
  // Locale-aware subject labels (subj.<code>) via the app-wide provider dict.
  const t = useT();
  // H8: a live free-access window rides the giveaway flow (Info → Done, free
  // activation). Payments-off keeps its own flow: nothing to activate there.
  const freeFlow =
    paymentMode === "giveaway" || (freeAccessActive && paymentMode !== "off");
  const flow: StepId[] = freeFlow ? FLOWS.giveaway : (FLOWS[paymentMode] ?? FLOWS.real);

  // stepIdx indexes into `flow`; `cur` is the step being rendered. Only steps
  // present in the mode's flow are ever reachable.
  const [stepIdx, setStepIdx] = useState(0);
  const cur: StepId = flow[Math.min(stepIdx, flow.length - 1)];
  const [pending, startTransition] = useTransition();

  // Step 1 — info.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [districtId, setDistrictId] = useState(""); // the CITY (historic naming)
  const [cityDistrictId, setCityDistrictId] = useState(""); // the rayon (Round 21)
  const [schoolId, setSchoolId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [infoErrors, setInfoErrors] = useState<string[]>([]);
  // The created child's profile id (returned by addChild; used by
  // subscribeChild / activateChildGiveaway).
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  // Avatar (preset boy/girl or an uploaded photo; "default" = initials bubble).
  // Applied AFTER the child row exists (the photo path needs the profile id);
  // avatarDone guards a Back/retry from re-applying it.
  const [avatarChoice, setAvatarChoice] = useState<ChildAvatarChoice>("default");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarDone, setAvatarDone] = useState(false);

  // Step 2 — subjects AND their cycles. Seeded from the (server-validated)
  // /services hand-off; the legacy subjects+interval pair still preselects.
  const catalog = useMemo<ConfiguratorSubject[]>(
    () => subjects.map((s) => ({ ...s, prices: s.prices as ConfiguratorSubject["prices"] })),
    [subjects],
  );
  const [plan, setPlan] = useState<PlanItem[]>(() =>
    normalizePlan(
      initialPlan && initialPlan.length > 0
        ? initialPlan
        : initialSubjectIds.map((subjectId) => ({
            subjectId,
            interval: isPlanInterval(initialInterval)
              ? initialInterval
              : DEFAULT_PLAN_INTERVAL,
          })),
      catalog,
    ),
  );

  // Step 3 — review + live quote.
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // Step 4 — payment confirmation + the result.
  const [payError, setPayError] = useState<string | null>(null);
  const [childUniqueId, setChildUniqueId] = useState<string | null>(null);
  // Migration 125 — the signed departure for the bank, when this plan is
  // PAYABLE. A brand-new child normally rides the free trial and never gets one
  // (`due_now` is 0, so subscribeChild applies the plan and returns `result`);
  // with `launch_promo_config.trial_days = 0` the very first plan is charged,
  // and then the money has to move BEFORE anything is granted. Holding it here
  // keeps the wizard on this step instead of announcing a success that neither
  // took a payment nor allocated an 8-digit ID.
  const [checkout, setCheckout] = useState<PlanCheckout | null>(null);

  // Rayons of the chosen city. A city with NO active rayons skips the district
  // field entirely (its schools attach directly to the city).
  const cityRayons = districtId
    ? cityDistricts.filter((d) => d.city_id === districtId)
    : [];
  const hasDistricts = cityRayons.length > 0;

  // Schools available for the chosen city (filtered client-side by district_id
  // = the CITY). When a rayon is chosen, narrow to that rayon's schools PLUS
  // the schools without a rayon yet (they must stay selectable), listed after
  // the exact matches so the grouping stays subtle.
  const citySchoolsAll = districtId
    ? schools.filter((s) => s.district_id === districtId)
    : [];
  const citySchools =
    hasDistricts && cityDistrictId
      ? [
          ...citySchoolsAll.filter((s) => s.city_district_id === cityDistrictId),
          ...citySchoolsAll.filter((s) => s.city_district_id == null),
        ]
      : citySchoolsAll;

  // The basket serialized as subject+cycle pairs: the quote effect keys on THIS
  // so a cycle change on one card refetches, and an unrelated re-render does not.
  const planKey = useMemo(
    () => plan.map((p) => `${p.subjectId}:${p.interval}`).join(","),
    [plan],
  );
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const available = useMemo(
    () => availableSubjects(catalog, plan.map((p) => p.subjectId)),
    [catalog, plan],
  );
  const localQuote = useMemo(() => computePlanQuote(catalog, plan), [catalog, plan]);

  // Live, AUTHORITATIVE quote whenever the review step's inputs change.
  useEffect(() => {
    if (cur !== "plan" || !studentProfileId) return;
    if (!planKey) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    // Drop a stale quote (fetched for another basket) so the summary falls back
    // to the honest client estimate while refetching.
    setQuote(null);
    const items = planKey.split(",").map((raw) => {
      const [subjectId, interval] = raw.split(":");
      return { subjectId, interval };
    });
    quoteSubscription({ studentId: studentProfileId, items }).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [cur, studentProfileId, planKey]);

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
    // Round 21: the rayon is required whenever the chosen city has active
    // rayons (the create RPC re-enforces this server-side).
    if (districtId && hasDistricts && !cityDistrictId) {
      local.push("addchild.err.districtRequired");
    }
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
    fd.set("city_district_id", cityDistrictId); // the rayon ("" → null server-side)
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

      // Apply the chosen avatar now that the child row exists (the photo path
      // needs the student profile id). Best-effort: an avatar failure never
      // blocks the wizard — the parent can set it later from Edit-Child.
      if (!avatarDone && avatarChoice !== "default") {
        const afd = new FormData();
        afd.set("student_profile_id", sid);
        if (avatarChoice === "photo") {
          if (avatarFile) {
            afd.set("choice", "photo");
            afd.set("avatar_file", avatarFile);
          }
        } else {
          afd.set("choice", avatarChoice);
        }
        if (afd.has("choice")) {
          const av = await saveChildAvatar(null, afd);
          if (av?.ok) setAvatarDone(true);
        }
      }

      if (freeFlow) {
        // Free-access grant + 8-digit ID allocation, server-verified (the
        // action re-checks ownership AND that a giveaway/free-access window
        // is live for this child).
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

      setStepIdx(1); // → subjects (real) or done (giveaway/off).
    });
  }

  // STEP "payment" → confirm the plan: create the subscription, allocate the
  // 8-digit ID, then reveal it. (A real provider replaces the server seam
  // inside subscribeChild — webhook-verified activation — not this UI step.)
  function confirmPayment() {
    if (!studentProfileId) return;
    setPayError(null);
    const fd = new FormData();
    fd.set("student_id", studentProfileId);
    // One entry per subject, carrying ITS cycle. No global `interval` field.
    for (const p of plan) fd.append("plan", `${p.subjectId}:${p.interval}`);

    startTransition(async () => {
      const res = await subscribeChild(null, fd);
      if (!res?.ok) {
        setPayError(res?.error ?? tt("sub.err.invalid"));
        return;
      }
      // PAYABLE: nothing was applied and nothing was charged yet. Show the
      // departure form and stay here — advancing would claim a success that has
      // not happened. The parent returns from the bank on /checkout/result.
      if (res.checkout) {
        setCheckout(res.checkout);
        return;
      }
      // FREE (the trial): the plan exists, so the 8-digit ID exists too.
      if (!res.result) {
        setPayError(tt("sub.err.invalid"));
        return;
      }
      setChildUniqueId(res.result.childUniqueId ?? null);
      setStepIdx(flow.length - 1);
    });
  }

  // Client-side ESTIMATE — each subject at its own cycle's price, shown until
  // the authoritative server quote arrives. Never a "per period" figure: the
  // basket may span several cycles.
  const subtotal = localQuote.dueToday;

  // MIGRATION 126 — IS A PAYMENT ABOUT TO HAPPEN? The label on the one button of
  // the payment step, taken from the SERVER quote's `due_now` and nothing else:
  // a trial (or a giveaway-priced basket) charges nothing and gets "confirm",
  // anything else gets "continue to payment" and gets exactly that. `total` is
  // NOT usable here — it is a different number whenever a trial applies, and
  // reading it is what let the old button promise a payment it never made.
  //
  // While the quote is still loading the button is DISABLED rather than
  // guessing. A quote that FAILED defaults to the payment wording: a button that
  // promises a payment step and then turns out not to need one is a far smaller
  // lie than one that promises no charge and then asks for money.
  const payableNow = !quote || !quote.ok || quote.dueNow > 0;

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
                  setCityDistrictId(""); // rayon belongs to the previous city
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

            {/* Round 21: rayon between City and School — disabled until a city
                is chosen; HIDDEN entirely when the chosen city has no active
                rayons (its schools attach directly to the city). */}
            {(!districtId || hasDistricts) && (
              <label className="field">
                <span className="field-label">{tt("addchild.field.district")} *</span>
                <select
                  value={cityDistrictId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCityDistrictId(next);
                    // Keep the chosen school only if it fits the new rayon
                    // (schools without a rayon stay valid); never mutate the
                    // rayon FROM the school — only the reverse.
                    setSchoolId((prev) => {
                      const s = schools.find((x) => x.id === prev);
                      return s &&
                        s.district_id === districtId &&
                        (!next || s.city_district_id == null || s.city_district_id === next)
                        ? prev
                        : "";
                    });
                  }}
                  disabled={!districtId}
                  required={hasDistricts}
                >
                  <option value="">
                    {districtId
                      ? tt("addchild.field.selectDistrict")
                      : tt("addchild.field.cityFirst")}
                  </option>
                  {cityRayons.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

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
                    {formatGradeLabel(g.level, locale, g.name)}
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

            {/* Avatar (optional): preset Boy/Girl, an uploaded photo, or the
                default initials bubble. Applied server-side after creation. */}
            <div className="field">
              <span className="field-label">{tt("addchild.avatar.title")}</span>
              <ChildAvatarPicker
                choice={avatarChoice}
                onChoiceChange={setAvatarChoice}
                file={avatarFile}
                onFileChange={setAvatarFile}
                disabled={pending || avatarDone}
                dict={dict}
              />
            </div>

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
            <p className="hint">{tt("plan.perSubjectHint")}</p>
            {subjects.length === 0 ? (
              <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
            ) : (
              <>
                {plan.length > 0 && (
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
                          onIntervalChange={(id, iv) =>
                            setPlan((prev) => setPlanInterval(prev, id, iv))
                          }
                          onRemove={(id) => setPlan((prev) => removePlanSubject(prev, id))}
                          disabled={pending}
                          locale={locale}
                          t={tt}
                        />
                      );
                    })}
                  </div>
                )}
                {available.length === 0 ? (
                  <p className="muted">{tt("cfg.allAdded")}</p>
                ) : (
                  <ul className="pcfg-list" style={{ marginTop: 10 }}>
                    {available.map((s) => {
                      // No global cycle exists any more, so the picker shows the
                      // cheapest cycle the subject is actually sold on.
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
                            onClick={() =>
                              setPlan((prev) => addPlanSubject(prev, s.id, catalog))
                            }
                            disabled={pending}
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
              </>
            )}
          </div>
        )}

        {/* =========================== STEP — PLAN =========================== */}
        {/* Migration 109: this step is the REVIEW. The three global plan cards
            are gone — the cycle is chosen per subject on the previous step —
            and the breakdown is grouped by cycle, because a single "/ ay" total
            under a mixed basket would be a false price. */}
        {cur === "plan" && (
          <div className="wiz-plan-step">
            <span className="field-label">{tt("plan.cycle")}</span>
            <div className="wizard-summary">
              <div className="quote-row">
                <span className="q-label">{tt("pay.subtotal")}</span>
                <span>
                  {quote && quote.ok ? quote.base : subtotal}{" "}
                  {quote && quote.ok ? quote.currency : "AZN"}
                </span>
              </div>
              <PlanSummary
                quote={localQuote}
                server={
                  quote && quote.ok
                    ? {
                        discountPercent: quote.discount_percent,
                        discount: quote.discount,
                        // Migration 127: the sibling TIER, so the wizard names
                        // the saving the same way the subscribe screen does.
                        rank: quote.rank,
                        // `due_now`, NOT `total` (migration 126, audit
                        // invariant H7). They are different numbers whenever a
                        // trial applies, and this row is captioned "due today".
                        dueToday: quote.dueNow,
                        trialDays: quote.trial_days,
                        currency: quote.currency,
                        // The per-cycle groups carry the sibling discount already
                        // applied. Omitting them made PlanSummary fall back to its
                        // client list-price sum, so a 2nd/3rd child saw
                        // UNDISCOUNTED per-cycle subtotals and renewal sentences
                        // under a correctly discounted total.
                        groups: quote.groups ?? null,
                      }
                    : null
                }
                loading={!quote}
                locale={locale}
                t={tt}
              />
            </div>
          </div>
        )}

        {/* ========================= STEP — PAYMENT ========================= */}
        {/* CONFIRMATION, not a card form. The demo payment mode was deleted on
            2026-08-18: there is no cosmetic card entry left anywhere, and the
            provider's own hosted page will collect the card when it lands. */}
        {cur === "payment" && (
          <div className="pay-card">
            <h2 style={{ margin: "0 0 4px" }}>{tt("pay.title")}</h2>
            <p className="muted">{tt("pay.note")}</p>

            <div className="wizard-summary" style={{ marginTop: 18 }}>
              {/* No period suffix: with per-subject cycles the only honest
                  single figure is what is charged now. */}
              <div className="quote-total">
                <span>{tt("plan.dueToday")}</span>
                <span>
                  {quote && quote.ok ? quote.dueNow : subtotal}{" "}
                  {quote && quote.ok ? quote.currency : "AZN"}
                </span>
              </div>
            </div>

            {/* Says WHY a zero is zero, so it cannot read as "free forever".
                Same sentence and same source as the subscribe page. */}
            {quote && quote.ok && quote.trial_days > 0 && quote.dueNow === 0 && (
              <p className="muted">
                {tt("sub.trialNoChargeToday").replace(
                  "{days}",
                  String(quote.trial_days),
                )}
              </p>
            )}

            {payError && <p className="form-error">{payError}</p>}

            {/* The full-page redirect to the acquirer, once the server has
                opened and signed the intent. Rendered here rather than on a
                step of its own: the parent authorises the charge in the same
                place they were shown what it costs. */}
            {checkout && (
              <CheckoutRedirect
                order={checkout.order}
                amount={checkout.amount}
                signed={{
                  action: checkout.action,
                  fields: checkout.fields,
                  amount: checkout.amount,
                }}
              />
            )}
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
                      : freeFlow
                        ? tt("addchild.freeAccessGranted")
                        : tt("pay.success")}
                  </strong>
                </p>
                <p className="muted">{tt("pay.idRevealed")}</p>
                {childUniqueId && <CopyableId id={childUniqueId} size="lg" />}
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
              disabled={pending || plan.length === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {cur === "plan" && (
            <button
              type="button"
              className="btn"
              onClick={() => setStepIdx(3)}
              disabled={pending || plan.length === 0}
            >
              {tt("addchild.next")}
            </button>
          )}
          {cur === "payment" && !checkout && (
            <button
              type="button"
              className="btn"
              onClick={confirmPayment}
              disabled={pending || plan.length === 0 || !quote}
            >
              {pending
                ? tt("pay.processing")
                : payableNow
                  ? tt("pay.continue")
                  : tt("pay.confirmNoCharge")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
