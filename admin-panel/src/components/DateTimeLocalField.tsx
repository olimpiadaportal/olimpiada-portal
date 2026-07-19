"use client";

// One optional datetime-local form field following the panel's hidden-ISO
// convention (documented in lib/admin/datetime.ts): the visible input holds
// the admin's LOCAL wall-clock value; the hidden field submits a UTC ISO
// string ("" = cleared → the server stores NULL). Extracted from the olympiad
// event-date field so the sale window (Round: package lifecycle) reuses the
// exact same timezone-safe plumbing.
import { useEffect, useState } from "react";

// ISO → local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. Runs only
// client-side (inside useEffect) so server/client timezone differences can
// never cause a hydration mismatch.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimeLocalField({
  name,
  label,
  initialIso,
  clearLabel,
  hint,
}: {
  name: string; // hidden-field name the server action reads (ISO string)
  label: string;
  initialIso?: string; // stored timestamptz from the DB ("" / undefined = unset)
  clearLabel: string;
  hint?: string;
}) {
  const [iso, setIso] = useState(initialIso ?? "");
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (initialIso) setLocal(isoToLocalInput(initialIso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onChange = (v: string) => {
    setLocal(v);
    const d = v ? new Date(v) : null;
    setIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="datetime-local"
          value={local}
          onChange={(e) => onChange(e.target.value)}
        />
        {local !== "" && (
          <button type="button" className="btn-ghost" onClick={() => onChange("")}>
            {clearLabel}
          </button>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
      <input type="hidden" name={name} value={iso} />
    </div>
  );
}
