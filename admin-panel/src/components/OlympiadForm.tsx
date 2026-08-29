"use client";

import { useActionState, useState } from "react";
import { saveOlympiadPackage, type OlympiadState } from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";
import { DateTimeLocalField } from "@/components/DateTimeLocalField";
import { OlympiadCycleSummary } from "@/components/OlympiadCycleSummary";
import { localeNames, locales, type Locale } from "@/i18n/config";
import {
  PER_ATTEMPT_MAX,
  PER_ATTEMPT_MIN,
  PER_ATTEMPT_DEFAULT,
} from "@/lib/admin/olympiad-per-attempt";

type Opt = { value: string; label: string };
type Defaults = {
  subject_id: string;
  olympiad_type_id: string;
  price: string;
  status: string;
  event?: string; // ISO timestamptz from the DB ("" = undated)
  saleStart?: string; // sale_starts_at ISO timestamptz ("" = unset)
  saleEnd?: string; // sale_ends_at ISO timestamptz ("" = unset)
  duration?: string; // attempt time limit in minutes (migration 047)
  perAttempt?: string; // questions_per_attempt (Round 49)
  tr: Record<string, { title: string; desc: string }>;
};

// EDIT-page metadata form (Round 34): grades are NOT edited here — they live
// in the Grades & Pools manager below the form (a grade is only added with
// its question file, and removed through the guarded RPC).
export function OlympiadForm({
  dict,
  locale,
  subjects,
  olympiadTypes,
  gradePools = [],
  defaults,
  id,
  submitLabel,
}: {
  dict: Record<string, string>;
  locale: Locale;
  subjects: Opt[];
  olympiadTypes: Opt[];
  /**
   * Target grades with their REAL published pool size (edit page).
   * Migration 106: each also carries its stored per-grade config, where ""
   * means "no override — inherit the package value".
   */
  gradePools?: {
    id: string;
    name: string;
    level: number;
    questions: number;
    perAttempt?: string;
    duration?: string;
  }[];
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<OlympiadState, FormData>(
    saveOlympiadPackage,
    null,
  );
  const [f, setF] = useState({
    subject_id: defaults?.subject_id ?? "",
    olympiad_type_id: defaults?.olympiad_type_id ?? "",
    olympiad_type_other: "",
    price: defaults?.price ?? "0",
    status: defaults?.status ?? "inactive",
    duration: defaults?.duration ?? "25",
    perAttempt: defaults?.perAttempt ?? String(PER_ATTEMPT_DEFAULT),
  });
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: defaults?.tr?.[l]?.title ?? "", desc: defaults?.tr?.[l]?.desc ?? "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Migration 106 — per-grade overrides, seeded from what is stored. Grades are
  // not added or removed here (that is the Grades & Pools manager below), so
  // this map is fixed for the life of the form.
  const [perGrade, setPerGrade] = useState<Record<string, { q: string; d: string }>>(() => {
    const o: Record<string, { q: string; d: string }> = {};
    for (const g of gradePools) o[g.id] = { q: g.perAttempt ?? "", d: g.duration ?? "" };
    return o;
  });
  const setPG = (id: string, k: "q" | "d", v: string) =>
    setPerGrade((p) => ({ ...p, [id]: { ...(p[id] ?? { q: "", d: "" }), [k]: v } }));
  // Only worth showing for 2+ grades: with one grade the fields above ARE the
  // configuration and a second identical pair would just invite disagreement.
  const multiGrade = gradePools.length > 1;

  return (
    <form action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}
      {/* Mandatory olympiad type — "Other" creates/reuses a type inline. */}
      <label className="field">
        <span className="field-label">{tt("oly2.type")} *</span>
        <select
          name="olympiad_type_id"
          value={f.olympiad_type_id}
          required
          onChange={(e) => set("olympiad_type_id", e.target.value)}
        >
          <option value="">{tt("manage.select")}</option>
          {olympiadTypes.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          <option value="__other">{tt("oly2.typeOther")}</option>
        </select>
      </label>
      {f.olympiad_type_id === "__other" && (
        <label className="field">
          <span className="field-label">{tt("oly2.typeOtherLabel")} *</span>
          <input
            name="olympiad_type_other"
            value={f.olympiad_type_other}
            maxLength={120}
            required
            placeholder={tt("oly2.typeOtherPh")}
            onChange={(e) => set("olympiad_type_other", e.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">{tt("oly2.subject")} *</span>
        <select name="subject_id" value={f.subject_id} required onChange={(e) => set("subject_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {subjects.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.price")}</span>
        <input
          name="price_amount"
          type="number"
          inputMode="decimal"
          // 0 is valid here — a free package is a real product concept.
          // These bounds are UX only; olympiad.ts re-checks server-side.
          min={0}
          max={10000}
          step="0.01"
          value={f.price}
          onChange={(e) => set("price", e.target.value)}
        />
      </label>
      {/* Round 49 — questions served per attempt. NOT the uploaded pool total:
          the pool (shown in the cycle summary below and in Grades & Pools) can
          be far larger; this is how many of them ONE sitting draws. min/max are
          UX only — the server action re-validates. */}
      <label className="field">
        <span className="field-label">{tt("oly2.perAttempt")} *</span>
        <input
          name="questions_per_attempt"
          type="number"
          min={PER_ATTEMPT_MIN}
          max={PER_ATTEMPT_MAX}
          step={1}
          required
          value={f.perAttempt}
          onChange={(e) => set("perAttempt", e.target.value)}
        />
        <span className="hint">{tt("oly2.perAttemptHelp")}</span>
        <span className="hint">{tt("oly2.perAttemptDistinct")}</span>
      </label>
      <OlympiadCycleSummary
        dict={dict}
        locale={locale}
        perAttemptRaw={f.perAttempt}
        grades={gradePools.map((g) => ({
          perAttemptRaw: perGrade[g.id]?.q ?? "",
          key: g.id,
          name: g.name,
          level: g.level,
          pool: g.questions,
        }))}
      />
      <label className="field">
        <span className="field-label">{tt("oly2.duration")} *</span>
        <input
          name="duration_minutes"
          type="number"
          min={5}
          max={240}
          step={1}
          required
          value={f.duration}
          onChange={(e) => set("duration", e.target.value)}
        />
        <span className="hint">{tt("oly2.durationHelp")}</span>
      </label>

      {/* ---- Migration 106: per-grade question count + duration -------------
          The marker tells the save action this form owns these fields, so a
          blank means "inherit" rather than "the caller forgot to render them".
          It is posted even for a single grade — that is exactly the case where
          the grade row must be cleared so the package fields above apply. */}
      <input type="hidden" name="__per_grade_cfg" value="1" />
      {multiGrade && (
        <div className="field">
          <span className="field-label">{tt("oly2.perGradeTitle")}</span>
          <span className="hint">{tt("oly2.perGradeDefaultNote")}</span>
          <span className="hint">{tt("oly2.perGradeCfgHint")}</span>
          <div className="oly-grade-cfg">
            {gradePools.map((g) => (
              <div key={g.id} className="oly-grade-cfg-row">
                <span className="oly-grade-cfg-name">{g.name}</span>
                <label className="oly-grade-cfg-field">
                  <span>{tt("oly2.perGradeCount")}</span>
                  <input
                    name={`qpa_${g.id}`}
                    type="number"
                    min={PER_ATTEMPT_MIN}
                    max={PER_ATTEMPT_MAX}
                    step={1}
                    inputMode="numeric"
                    placeholder={f.perAttempt}
                    value={perGrade[g.id]?.q ?? ""}
                    disabled={pending}
                    onChange={(e) => setPG(g.id, "q", e.target.value)}
                  />
                </label>
                <label className="oly-grade-cfg-field">
                  <span>{tt("oly2.perGradeDuration")}</span>
                  <input
                    name={`dur_${g.id}`}
                    type="number"
                    min={5}
                    max={240}
                    step={1}
                    inputMode="numeric"
                    placeholder={f.duration}
                    value={perGrade[g.id]?.d ?? ""}
                    disabled={pending}
                    onChange={(e) => setPG(g.id, "d", e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        <span className="field-label">{tt("oly2.statusLabel")}</span>
        <select name="status" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="inactive">{tt("oly2.status.inactive")}</option>
          <option value="active">{tt("oly2.status.active")}</option>
          <option value="archived">{tt("oly2.status.archived")}</option>
        </select>
      </label>
      {/* Planned event date + public sale window: all three follow the
          hidden-ISO convention documented in lib/admin/datetime.ts. */}
      <DateTimeLocalField
        name="event_starts_at"
        label={tt("oly2.eventAt")}
        initialIso={defaults?.event ?? ""}
        clearLabel={tt("oly2.eventClear")}
        hint={tt("oly2.eventAtHint")}
      />
      <DateTimeLocalField
        name="sale_starts_at"
        label={tt("oly2.saleStart")}
        initialIso={defaults?.saleStart ?? ""}
        clearLabel={tt("oly2.eventClear")}
      />
      <DateTimeLocalField
        name="sale_ends_at"
        label={tt("oly2.saleEnd")}
        initialIso={defaults?.saleEnd ?? ""}
        clearLabel={tt("oly2.eventClear")}
        hint={tt("oly2.saleHint")}
      />
      {locales.map((l) => (
        <div key={l} style={{ marginTop: 12 }}>
          <h3>
            {localeNames[l as Locale]}
            {l === "az" && <span className="req"> *</span>}
          </h3>
          <label className="field">
            <span className="field-label">{tt("oly2.title")}</span>
            <input name={`title_${l}`} value={tr[l].title} onChange={(e) => setTr((p) => ({ ...p, [l]: { ...p[l], title: e.target.value } }))} />
          </label>
          <label className="field">
            <span className="field-label">{tt("oly2.desc")}</span>
            <textarea name={`desc_${l}`} rows={3} value={tr[l].desc} onChange={(e) => setTr((p) => ({ ...p, [l]: { ...p[l], desc: e.target.value } }))} />
          </label>
        </div>
      ))}
      {state?.error && <p className="form-error">{state.error}</p>}
      <ActionButton pending={pending} pendingLabel={tt("manage.saving")}>
        {submitLabel}
      </ActionButton>
    </form>
  );
}
