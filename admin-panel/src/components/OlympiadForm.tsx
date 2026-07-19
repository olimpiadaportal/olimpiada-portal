"use client";

import { useActionState, useState } from "react";
import { saveOlympiadPackage, type OlympiadState } from "@/lib/admin/olympiad";
import { DateTimeLocalField } from "@/components/DateTimeLocalField";
import { localeNames, locales, type Locale } from "@/i18n/config";

type Opt = { value: string; label: string };
type Defaults = {
  subject_id: string;
  grade_id: string;
  price: string;
  status: string;
  event?: string; // ISO timestamptz from the DB ("" = undated)
  saleStart?: string; // sale_starts_at ISO timestamptz ("" = unset)
  saleEnd?: string; // sale_ends_at ISO timestamptz ("" = unset)
  duration?: string; // attempt time limit in minutes (migration 047)
  tr: Record<string, { title: string; desc: string }>;
};

export function OlympiadForm({
  dict,
  subjects,
  grades,
  defaults,
  id,
  submitLabel,
}: {
  dict: Record<string, string>;
  subjects: Opt[];
  grades: Opt[];
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
    grade_id: defaults?.grade_id ?? "",
    price: defaults?.price ?? "0",
    status: defaults?.status ?? "inactive",
    duration: defaults?.duration ?? "25",
  });
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: defaults?.tr?.[l]?.title ?? "", desc: defaults?.tr?.[l]?.desc ?? "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}
      <label className="field">
        <span className="field-label">{tt("oly2.subject")} *</span>
        <select name="subject_id" value={f.subject_id} required onChange={(e) => set("subject_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {subjects.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.grade")} *</span>
        <select name="grade_id" value={f.grade_id} required onChange={(e) => set("grade_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {grades.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.price")}</span>
        <input name="price_amount" type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
      </label>
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
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("manage.saving") : submitLabel}
      </button>
    </form>
  );
}
