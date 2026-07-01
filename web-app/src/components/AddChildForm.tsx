"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import { addChild, type AddChildState } from "@/lib/auth/parentService";

type Grade = { id: string; level: number; name: string };

// Static list of major Azerbaijani cities (+ "Other" → free text). Labels are the
// native Azerbaijani place names, which are the same across our 3 locales.
const CITIES = [
  "Bakı",
  "Gəncə",
  "Sumqayıt",
  "Mingəçevir",
  "Şirvan",
  "Naxçıvan",
  "Lənkəran",
  "Şəki",
  "Yevlax",
];

// A small starter datalist of well-known schools (free text is still allowed).
const SCHOOL_SUGGESTIONS = [
  "ADA Məktəbi",
  "Avropa Liseyi",
  "Bakı Avropa Liseyi",
  "Təbiət Elmləri Liseyi",
];

export function AddChildForm({
  dict,
  grades,
}: {
  dict: Record<string, string>;
  grades: Grade[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<AddChildState, FormData>(
    addChild,
    null,
  );
  const [city, setCity] = useState("");

  // On success the child exists but has NO login ID yet — send the parent straight
  // to the plan/subscribe step, where the 8-digit ID is allocated and revealed.
  if (state?.ok && state.studentProfileId) {
    return (
      <div className="card">
        <p>
          <strong>{tt("parent.child.created")}</strong>
        </p>
        <p className="muted">{tt("parent.child.choosePlanNote")}</p>
        <div className="site-cta" style={{ marginTop: 12 }}>
          <Link className="btn" href={`/children/${state.studentProfileId}/subscribe`}>
            {tt("parent.child.choosePlan")}
          </Link>
          <Link className="btn-ghost" href="/dashboard">
            {tt("parent.dash.title")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="form">
      <label className="field">
        <span className="field-label">{tt("parent.child.first")} *</span>
        <input name="first_name" required />
      </label>
      <label className="field">
        <span className="field-label">{tt("parent.child.last")} *</span>
        <input name="last_name" required />
      </label>

      <label className="field">
        <span className="field-label">{tt("parent.child.grade")}</span>
        <select name="grade_id" defaultValue="">
          <option value="">{tt("parent.child.gradeSelect")}</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{tt("parent.child.city")}</span>
        <select name="city" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">{tt("parent.child.citySelect")}</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__other__">{tt("parent.child.cityOther")}</option>
        </select>
      </label>
      {city === "__other__" && (
        <label className="field">
          <span className="field-label">{tt("parent.child.cityOtherLabel")}</span>
          <input name="city_other" />
        </label>
      )}

      <label className="field">
        <span className="field-label">{tt("parent.child.school")}</span>
        <input name="school_name" list="school-suggestions" />
        <datalist id="school-suggestions">
          {SCHOOL_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span className="field-label">{tt("parent.child.password")} *</span>
        <input name="password" type="password" required minLength={8} />
      </label>
      <p className="hint">{tt("parent.child.passwordHint")}</p>
      {state?.errors && state.errors.length > 0 && (
        <ul className="form-error">
          {state.errors.map((e, i) => (
            <li key={i}>{tt(e)}</li>
          ))}
        </ul>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("parent.child.submitting") : tt("parent.child.submit")}
      </button>
    </form>
  );
}
