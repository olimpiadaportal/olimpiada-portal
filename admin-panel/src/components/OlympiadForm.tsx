"use client";

import { useActionState, useEffect, useState } from "react";
import { saveOlympiadPackage, type OlympiadState } from "@/lib/admin/olympiad";
import { localeNames, locales, type Locale } from "@/i18n/config";

type Opt = { value: string; label: string };
type Defaults = {
  subject_id: string;
  grade_id: string;
  price: string;
  status: string;
  event?: string; // ISO timestamptz from the DB ("" = undated)
  tr: Record<string, { title: string; desc: string }>;
};

// ISO → local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. Runs only
// client-side (inside useEffect) so server/client timezone differences can
// never cause a hydration mismatch.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  });
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: defaults?.tr?.[l]?.title ?? "", desc: defaults?.tr?.[l]?.desc ?? "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Optional planned event date/time. The visible datetime-local input holds
  // the admin's LOCAL wall-clock value; the hidden field submits a proper ISO
  // string (or "" → NULL / cleared).
  const [eventIso, setEventIso] = useState(defaults?.event ?? "");
  const [eventLocal, setEventLocal] = useState("");
  useEffect(() => {
    if (defaults?.event) setEventLocal(isoToLocalInput(defaults.event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onEvent = (v: string) => {
    setEventLocal(v);
    const d = v ? new Date(v) : null;
    setEventIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
  };

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
        <span className="field-label">{tt("oly2.grade")}</span>
        <select name="grade_id" value={f.grade_id} onChange={(e) => set("grade_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {grades.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.price")}</span>
        <input name="price_amount" type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.statusLabel")}</span>
        <select name="status" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="inactive">{tt("oly2.status.inactive")}</option>
          <option value="active">{tt("oly2.status.active")}</option>
          <option value="archived">{tt("oly2.status.archived")}</option>
        </select>
      </label>
      <div className="field">
        <span className="field-label">{tt("oly2.eventAt")}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="datetime-local"
            value={eventLocal}
            onChange={(e) => onEvent(e.target.value)}
          />
          {eventLocal !== "" && (
            <button type="button" className="btn-ghost" onClick={() => onEvent("")}>
              {tt("oly2.eventClear")}
            </button>
          )}
        </div>
        <p className="hint">{tt("oly2.eventAtHint")}</p>
        <input type="hidden" name="event_starts_at" value={eventIso} />
      </div>
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
