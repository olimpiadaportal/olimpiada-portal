"use client";

// Free-Access management UI (Admin-only). Pure UI: ALL validation/authorization
// lives in the lib/admin/freeAccess server actions. Reuses the debounced
// searchParents autocomplete (same server search + .parent-picker CSS as the
// admin Add-Child form) and getParentChildren for the optional child select.
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { searchParents, type ParentSearchResult } from "@/lib/admin/accounts";
import {
  createFreeAccessInterval,
  deactivateFreeAccessInterval,
  getParentChildren,
  type ChildOption,
  type CreateFreeAccessState,
  type FreeAccessRow,
  type IntervalStatus,
} from "@/lib/admin/freeAccess";

// Convert a naive <input type="datetime-local"> value ("2026-07-05T14:30") to a
// UTC ISO string, interpreting it in the admin's OWN browser timezone. "" stays "".
// Exported so the Free-Access wizard shares the exact same TZ conversion.
export function toUtcIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export type FreeAccessStrings = {
  createHeading: string;
  listHeading: string;
  parent: string;
  parentSearch: string;
  parentSearching: string;
  parentEmpty: string;
  parentChildren: string; // rendered as "{n} children"
  parentClear: string;
  child: string;
  childAll: string;
  childLoading: string;
  start: string;
  end: string;
  note: string;
  notePlaceholder: string;
  create: string;
  creating: string;
  created: string;
  scheduleAnother: string;
  deactivate: string;
  deactivateConfirm: string;
  endBeforeStart: string;
  target: string;
  window: string;
  statusHeading: string;
  statusActive: string;
  statusScheduled: string;
  statusExpired: string;
  statusInactive: string;
  none: string;
};

export function FreeAccessManager({
  intervals,
  locale,
  strings,
}: {
  intervals: FreeAccessRow[];
  locale: string;
  strings: FreeAccessStrings;
}) {
  return (
    <>
      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{strings.createHeading}</h3>
        <CreateSection strings={strings} />
      </section>

      <section className="card">
        <h3>{strings.listHeading}</h3>
        <IntervalsTable intervals={intervals} locale={locale} strings={strings} />
      </section>
    </>
  );
}

// Remount-on-success wrapper: a fresh key clears the finished action state so
// the next schedule starts from an empty form. The list refreshes via the
// action's revalidatePath("/free-access").
function CreateSection({ strings }: { strings: FreeAccessStrings }) {
  const [formKey, setFormKey] = useState(0);
  return (
    <CreateForm
      key={formKey}
      strings={strings}
      onReset={() => setFormKey((k) => k + 1)}
    />
  );
}

function CreateForm({
  strings,
  onReset,
}: {
  strings: FreeAccessStrings;
  onReset: () => void;
}) {
  const [state, action, pending] = useActionState<CreateFreeAccessState, FormData>(
    createFreeAccessInterval,
    null,
  );

  const [parent, setParent] = useState<ParentSearchResult | null>(null);
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [loadingChildren, startLoadChildren] = useTransition();
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function onParentChange(p: ParentSearchResult | null) {
    setParent(p);
    setStudentId("");
    setChildren([]);
    if (p) {
      startLoadChildren(async () => {
        const kids = await getParentChildren(p.id);
        setChildren(kids);
      });
    }
  }

  // Client guard: end must be strictly after start (server re-validates).
  const endInvalid = Boolean(
    start && end && new Date(end).getTime() <= new Date(start).getTime(),
  );
  const canSubmit = Boolean(parent && start && end) && !endInvalid && !pending;

  if (state?.ok) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="form-ok">{strings.created}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onReset}>
            {strings.scheduleAnother}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <ParentPicker strings={strings} onSelect={onParentChange} />
      {/* The authoritative parent value the server reads. */}
      <input type="hidden" name="parent_profile_id" value={parent?.id ?? ""} />

      <label className="field">
        <span>{strings.child}</span>
        <select
          name="student_profile_id"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          disabled={!parent || loadingChildren}
        >
          <option value="">
            {loadingChildren ? strings.childLoading : strings.childAll}
          </option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {/* The datetime-local inputs hold NAIVE local time; the server is UTC, so we
          submit the UTC-normalized ISO string (browser interprets the naive value
          in the admin's own timezone) via hidden fields to avoid a TZ-offset shift. */}
      <input type="hidden" name="starts_at" value={toUtcIso(start)} />
      <input type="hidden" name="ends_at" value={toUtcIso(end)} />
      <div className="form-grid">
        <label className="field">
          <span>{strings.start}</span>
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{strings.end}</span>
          <input
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      {endInvalid && <p className="form-error">{strings.endBeforeStart}</p>}

      <label className="field">
        <span>{strings.note}</span>
        <input
          name="note"
          maxLength={300}
          autoComplete="off"
          placeholder={strings.notePlaceholder}
        />
      </label>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={!canSubmit}>
          {pending ? strings.creating : strings.create}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}

// Live parent autocomplete (debounced server search) — mirrors the Add-Child
// ParentPicker but lifts the selection up via onSelect (the hidden input lives
// in the parent form).
function ParentPicker({
  strings,
  onSelect,
}: {
  strings: FreeAccessStrings;
  onSelect: (p: ParentSearchResult | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ParentSearchResult[]>([]);
  const [selected, setSelected] = useState<ParentSearchResult | null>(null);
  const [showList, setShowList] = useState(false);
  const [searching, startSearch] = useTransition();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debRef.current) clearTimeout(debRef.current);
    },
    [],
  );

  function onChange(v: string) {
    setQ(v);
    if (selected) {
      setSelected(null);
      onSelect(null);
    }
    if (debRef.current) clearTimeout(debRef.current);
    const term = v.trim();
    if (!term) {
      setResults([]);
      setShowList(false);
      return;
    }
    // Debounce (300ms) so we don't hit the DB on every keystroke.
    debRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchParents(term);
        setResults(r);
        setShowList(true);
      });
    }, 300);
  }

  function pick(p: ParentSearchResult) {
    setSelected(p);
    setQ(p.name);
    setShowList(false);
    onSelect(p);
  }

  function clear() {
    setSelected(null);
    setQ("");
    onSelect(null);
  }

  const contact = (p: ParentSearchResult) =>
    [p.phone, p.email].filter(Boolean).join(" · ");

  return (
    <div className="field parent-picker" style={{ position: "relative" }}>
      <span>{strings.parent}</span>
      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && !selected && setShowList(true)}
        placeholder={strings.parentSearch}
        autoComplete="off"
        aria-label={strings.parentSearch}
      />
      {selected && (
        <button
          type="button"
          className="btn-ghost"
          style={{ alignSelf: "flex-start", padding: "2px 8px", fontSize: "0.8rem" }}
          onClick={clear}
        >
          {strings.parentClear}
        </button>
      )}
      {searching && (
        <p className="muted" style={{ margin: "4px 0" }}>
          {strings.parentSearching}
        </p>
      )}
      {showList && !searching && (
        <ul className="parent-results" role="listbox">
          {results.length === 0 ? (
            <li className="muted parent-result-empty">{strings.parentEmpty}</li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="parent-result"
                  role="option"
                  aria-selected={false}
                  onClick={() => pick(p)}
                >
                  <span className="parent-result-name">{p.name}</span>
                  {contact(p) && (
                    <span className="parent-result-contact muted">{contact(p)}</span>
                  )}
                  <span className="parent-result-count muted">
                    {p.childCount} {strings.parentChildren}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function statusPill(s: IntervalStatus): string {
  if (s === "active") return "pill-ok";
  if (s === "expired") return "pill-warn";
  return "pill-muted"; // scheduled + inactive
}

function statusLabel(s: IntervalStatus, strings: FreeAccessStrings): string {
  switch (s) {
    case "active":
      return strings.statusActive;
    case "scheduled":
      return strings.statusScheduled;
    case "expired":
      return strings.statusExpired;
    case "inactive":
      return strings.statusInactive;
  }
}

// Exported so the Free-Access wizard can render the same scheduled/active
// windows table (with the Deactivate action) below its stepper.
export function IntervalsTable({
  intervals,
  locale,
  strings,
}: {
  intervals: FreeAccessRow[];
  locale: string;
  strings: FreeAccessStrings;
}) {
  // Render windows in Asia/Baku (UTC+4, no DST) — consistent with the audit log.
  const fmt = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Baku",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  if (intervals.length === 0) {
    return <p className="muted">{strings.none}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{strings.target}</th>
            <th>{strings.window}</th>
            <th>{strings.statusHeading}</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {intervals.map((r) => (
            <tr key={r.id}>
              <td>
                {r.studentName ? (
                  <span className="nowrap">→ {r.studentName}</span>
                ) : (
                  <span>{r.parentName ?? "—"}</span>
                )}
                {r.note && (
                  <div className="muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                    {r.note}
                  </div>
                )}
              </td>
              <td className="nowrap">
                {fmt(r.startsAt)} → {fmt(r.endsAt)}
              </td>
              <td className="nowrap">
                <span className={`pill ${statusPill(r.status)}`}>
                  {statusLabel(r.status, strings)}
                </span>
              </td>
              <td className="row-actions nowrap">
                {(r.status === "active" || r.status === "scheduled") && (
                  <DeactivateButton id={r.id} strings={strings} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeactivateButton({
  id,
  strings,
}: {
  id: string;
  strings: FreeAccessStrings;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await deactivateFreeAccessInterval(fd);
        })
      }
      onSubmit={(e) => {
        if (!confirm(strings.deactivateConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost btn-sm" disabled={pending}>
        {strings.deactivate}
      </button>
    </form>
  );
}
