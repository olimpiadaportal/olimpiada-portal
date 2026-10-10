"use client";

// D2/R11 — Add-Child WIZARD (new-child flow). One client wizard that drives
// "create child → start the free trial → reveal the 8-digit ID" without
// navigating away between steps.
//
// TRIAL-FIRST ONBOARDING (owner, 2026-10-10). The subscription and payment
// steps are OUT of onboarding. Until now the wizard ended at the bank: the
// 24-hour trial lived on a page the wizard never led to, and production had
// recorded zero trials. Now:
//
//   mode 'real' — THREE steps:
//     1. INFO  — name, city, school (filtered to city), grade, gender, password.
//                "Next" calls addChild (creates the child AND its 8-digit login
//                ID — migration 146) and keeps the returned ids.
//     2. TRIAL — "Choose 2 subjects and enjoy 24 hours of FREE access": the ONE
//                trial picker (FreeTrialActivation) inline, offering only the
//                subjects the chosen grade studies. No card, no price, nothing
//                charged; the database decides eligibility (one trial per child,
//                a per-email cap that survives account deletion — migration 183).
//                "Skip" moves on without a trial — the path a parent whose email
//                has used its trials takes.
//     3. DONE  — the trial's subjects and countdown (or, when skipped, the way
//                to Manage Subscription) + the 8-digit ID.
//
//   mode 'giveaway' — TWO steps (Info → Done): after addChild succeeds the
//     same transition calls activateChildGiveaway (grants free access and
//     reveals the 8-digit ID). H8: an ACTIVE parent free-access window
//     (freeAccessActive prop, server-resolved) takes the SAME two-step path —
//     the server action re-checks that a free window really covers the child.
//
//   mode 'off' — TWO steps (Info → Done): the child is still created, then a
//     notice step shows gate.paymentsOff + a dashboard link.
//
// Subscribing happens AFTER onboarding, from Manage Subscription
// (children/[id]/subscribe), which prices everything server-side.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import {
  ChildAvatarPicker,
  type ChildAvatarChoice,
} from "@/components/ChildAvatarPicker";
import {
  ChildGenderField,
  type ChildGenderChoice,
} from "@/components/ChildGenderField";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { addChild } from "@/lib/auth/parentService";
import { saveChildAvatar } from "@/lib/auth/childAvatarActions";
import { activateChildGiveaway } from "@/lib/auth/subscriptionService";
import { CopyableId } from "@/components/CopyableId";
import { FreeTrialActivation } from "@/components/FreeTrialActivation";
import { FreeTrialCountdown } from "@/components/FreeTrialCountdown";
import { formatShortDate } from "@/lib/formatDate";

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
type Subj = { id: string; code: string | null; name: string };

type StepId = "info" | "trial" | "done";

const STEP_KEY: Record<StepId, string> = {
  info: "addchild.step.info",
  trial: "addchild.step.trial",
  done: "addchild.step.done",
};

// Ordered steps per payment mode. Unknown/missing mode falls back to 'real' —
// the server actions still gate every mutation authoritatively.
const FLOWS: Record<string, StepId[]> = {
  real: ["info", "trial", "done"],
  giveaway: ["info", "done"],
  off: ["info", "done"],
};

export function AddChildWizard({
  cities,
  cityDistricts,
  schools,
  grades,
  subjects,
  taughtByGrade = {},
  dict,
  trialDict,
  paymentMode,
  freeAccessActive = false,
  initialTrialSubjectIds = [],
}: {
  cities: City[];
  cityDistricts: CityDistrict[];
  schools: School[];
  grades: Grade[];
  subjects: Subj[];
  /**
   * Grade id → the subject ids that grade studies (subjects_taught_to_grade,
   * migration 155), resolved server-side. `null` for a grade means "unknown,
   * do not filter" — the same rule keepTaughtSubjects applies everywhere.
   */
  taughtByGrade?: Record<string, string[] | null>;
  dict: Record<string, string>;
  /** Translated strings for the inline trial picker (FreeTrialActivation). */
  trialDict: Record<string, string>;
  /** Server-resolved payment mode: 'real' | 'giveaway' | 'off'. */
  paymentMode: string;
  /** H8: server-resolved active free-access window for this parent. */
  freeAccessActive?: boolean;
  /**
   * PRESELECTION handed off from the public /services configurator, already
   * validated server-side. Pure UX: only the first two that this grade studies
   * are preselected, and the parent can change them.
   */
  initialTrialSubjectIds?: string[];
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
  // REQUIRED gender (owner, 2026-09-16). "" is the starting state and the step
  // cannot advance while it is still "". Never pre-select a value here: a
  // defaulted answer about a child is an answer nobody gave, and it would be
  // indistinguishable in the export from one a parent actually chose.
  const [gender, setGender] = useState<ChildGenderChoice>("");
  const [infoErrors, setInfoErrors] = useState<string[]>([]);
  // Things that did NOT get saved even though the child did. Not errors — the
  // wizard moves on — but they stay on screen for the rest of the flow, because
  // only the parent can put back what the platform dropped.
  //
  // EMPTY IN EVERY PATH TODAY, AND KEPT ANYWAY. Its one member was the optional
  // gender, which was written as its own patch AFTER the provisioning
  // transaction and could therefore fail on its own; since 2026-09-16 the value
  // rides inside create_child_account, so it fails WITH the child or not at
  // all. The channel stays because "committed, but we saved less than you gave
  // us" is a shape this flow will have again, and because the mobile BFF and
  // the app already carry it end to end.
  const [infoWarnings, setInfoWarnings] = useState<string[]>([]);
  // The created child's profile id (returned by addChild; used by
  // the trial step / activateChildGiveaway).
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  // Avatar (preset boy/girl or an uploaded photo; "default" = initials bubble).
  // Applied AFTER the child row exists (the photo path needs the profile id);
  // avatarDone guards a Back/retry from re-applying it.
  const [avatarChoice, setAvatarChoice] = useState<ChildAvatarChoice>("default");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarDone, setAvatarDone] = useState(false);

  // The created child's 8-digit login ID (issued with the child, migration 146).
  const [childUniqueId, setChildUniqueId] = useState<string | null>(null);

  // Step 2 — the free trial. Set once the database has granted it.
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [trialSubjectIds, setTrialSubjectIds] = useState<string[]>([]);

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

  // What the trial step offers: the subjects the chosen grade studies, under the
  // labels the parent reads. Same rule as every other subject list.
  const trialSubjects = useMemo(() => {
    const taught = gradeId ? taughtByGrade[gradeId] : null;
    const allow = taught ? new Set(taught) : null;
    return subjects
      .filter((s) => !allow || allow.has(s.id))
      .map((s) => ({ id: s.id, name: subjectLabel(t, s.code, s.name) }));
  }, [subjects, taughtByGrade, gradeId, t]);
  const trialPreselect = useMemo(() => {
    const offered = new Set(trialSubjects.map((s) => s.id));
    return initialTrialSubjectIds.filter((id) => offered.has(id)).slice(0, 2);
  }, [initialTrialSubjectIds, trialSubjects]);
  // Preview only — the RPC computes the real window from its own clock. Read
  // when the trial step is reached (never during the server render).
  const trialEndsPreview = useMemo(
    () =>
      cur === "trial" ? formatShortDate(new Date(Date.now() + 24 * 3600 * 1000), locale) : "",
    [cur, locale],
  );

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
    // Owner, 2026-09-16: the gender joins the other required facts about the
    // child. Same key validateChildInfo returns, so the parent reads one
    // sentence whether the refusal came from here or from the server.
    if (!gender) local.push("addchild.err.genderRequired");
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
    // Required — the guard above already refused "", and createChild refuses it
    // again before the provisioning RPC is called.
    fd.set("gender", gender);
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
        // Issued with the child (migration 146); a free path below may
        // re-report the same id.
        setChildUniqueId(res.childUniqueId ?? null);
        // A success that saved less than it was given says so.
        setInfoWarnings(res.warnings ?? []);
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

      setStepIdx(1); // → trial (real) or done (giveaway/off).
    });
  }

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

      {/* OUTSIDE the step body on purpose: the child is already created, so the
          wizard has moved on, and this must follow the parent to the step they
          are now on instead of vanishing with the form that produced it. */}
      {infoWarnings.length > 0 && (
        <ul className="warn" role="status" style={{ margin: "0 0 16px", paddingLeft: 18 }}>
          {infoWarnings.map((w, i) => (
            <li key={i}>{tt(w)}</li>
          ))}
        </ul>
      )}

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

            {/* Required gender (owner, 2026-09-16) — sits with the other facts
                about the child and gates this step exactly like the city,
                school and grade above it. The refusal is shown under the
                select as well as in the list at the bottom: this step is long
                enough that a message at its foot is a message nobody reads. */}
            <ChildGenderField
              value={gender}
              onChange={setGender}
              disabled={pending}
              error={
                infoErrors.find(
                  (e) =>
                    e === "addchild.err.genderRequired" ||
                    e === "addchild.err.genderInvalid",
                ) ?? null
              }
              dict={dict}
            />

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

            {/* THE SUMMARY LIST SKIPS WHAT A FIELD ALREADY SHOWS. The gender
                control renders its own refusal underneath itself (above), so
                leaving it in this list too printed the same sentence twice on
                one step - once where the parent is looking and once at the
                foot. A duplicated error reads as two separate problems. Any
                error WITHOUT its own field slot still belongs here, which is
                why this filters rather than disappearing. */}
            {(() => {
              const FIELD_OWNED = new Set([
                "addchild.err.genderRequired",
                "addchild.err.genderInvalid",
              ]);
              const unowned = infoErrors.filter((e) => !FIELD_OWNED.has(e));
              return unowned.length > 0 ? (
                <ul className="form-error">
                  {unowned.map((e, i) => (
                    <li key={i}>{tt(e)}</li>
                  ))}
                </ul>
              ) : null;
            })()}
          </div>
        )}

        {/* ========================== STEP — TRIAL ========================== */}
        {/* The ONE trial picker, inline. Eligibility, the two-subject rule, the
            24 hours and the per-email cap are all the database's; this step
            only collects the choice. Nothing here mentions a price. */}
        {cur === "trial" && studentProfileId && (
          <div className="wiz-trial-step">
            <FreeTrialActivation
              studentId={studentProfileId}
              childName={`${firstName.trim()} ${lastName.trim()}`.trim()}
              subjects={trialSubjects}
              endsAtPreview={trialEndsPreview}
              initialSelected={trialPreselect}
              d={trialDict}
              onActivated={(endsAt, ids) => {
                setTrialEndsAt(endsAt);
                setTrialSubjectIds(ids);
                setStepIdx(flow.length - 1);
              }}
            />
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
                        : trialEndsAt
                          ? tt("addchild.trial.started")
                          : tt("addchild.created")}
                  </strong>
                </p>
                {trialEndsAt && (
                  <>
                    <p className="muted">
                      {tt("addchild.trial.subjects").replace(
                        "{subjects}",
                        trialSubjects
                          .filter((s) => trialSubjectIds.includes(s.id))
                          .map((s) => s.name)
                          .join(", "),
                      )}
                    </p>
                    <p className="ftrial-status-endsin">
                      <span>{tt("trial.status.endsIn")}</span>{" "}
                      <FreeTrialCountdown
                        endsAt={trialEndsAt}
                        units={{ h: tt("trial.time.h"), m: tt("trial.time.m"), s: tt("trial.time.s") }}
                        endedLabel={tt("trial.expired.title")}
                      />
                    </p>
                  </>
                )}
                <p className="muted">{tt("pay.idRevealed")}</p>
                {childUniqueId && <CopyableId id={childUniqueId} size="lg" />}
                <p className="muted">{tt("parent.child.idNote")}</p>
                <div className="site-cta wiz-done-cta">
                  <Link className="btn" href="/dashboard">
                    {tt("parent.dash.title")}
                  </Link>
                  {/* Subscribing lives HERE now, after onboarding — never inside it. */}
                  {!freeFlow && studentProfileId && (
                    <Link className="btn-ghost" href={`/children/${studentProfileId}/subscribe`}>
                      {tt("addchild.manageSubscription")}
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions (hidden on the final DONE step). */}
      {cur !== "done" && (
        <div className="wizard-actions">
          {/* No Back from the trial step: the child already exists, and the
              info form would no longer be what was saved. The way out of the
              trial step is to skip it. */}
          {cur === "trial" ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStepIdx(flow.length - 1)}
              disabled={pending}
            >
              {tt("addchild.trial.skip")}
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
        </div>
      )}
    </div>
  );
}
