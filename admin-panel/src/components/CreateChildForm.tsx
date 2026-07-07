"use client";

// Round 11 (owner item 7) — admin-created child account with an optional
// payment BYPASS (comped access). Round 12 — live parent autocomplete (server
// search: name/email/phone + child count) + mandatory City/School cascade.
// Pure UI: all validation/authorization lives in the server actions.
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  createChildForParent,
  searchParents,
  type CreateChildState,
  type ParentSearchResult,
} from "@/lib/admin/accounts";
import { PasswordInput } from "@/components/PasswordInput";

export type GradeOption = { id: string; name: string };
// intervals = plan intervals this subject has ACTIVE pricing for.
export type SubjectOption = { id: string; name: string; intervals: string[] };
export type CityOption = { id: string; name: string };
export type SchoolOpt = {
  id: string;
  name: string;
  district_id: string;
  is_private: boolean;
};

export type CreateChildStrings = {
  open: string;
  title: string;
  intro: string; // "bypass exists only here" explanation shown at the top
  parent: string;
  parentSearch: string; // input placeholder
  parentSearching: string; // loading state
  parentEmpty: string; // "No parent found"
  parentChildren: string; // "children" (rendered as "{n} children")
  parentClear: string; // clear selection
  firstName: string;
  lastName: string;
  password: string;
  passwordHint: string;
  grade: string;
  gradeNone: string;
  city: string;
  cityChoose: string;
  school: string;
  schoolChoose: string;
  cityFirst: string;
  privateSchools: string;
  publicSchools: string;
  grant: string;
  grantHelp: string;
  interval: string;
  intervalWeek: string;
  intervalMonth: string;
  intervalYear: string;
  subjects: string;
  subjectsNone: string;
  days: string;
  daysHelp: string;
  submit: string;
  submitting: string;
  done: string;
  idLabel: string;
  idPending: string;
  bypassNote: string;
  close: string;
  cancel: string;
  showPassword: string;
  hidePassword: string;
};

export function CreateChildForm({
  grades,
  subjects,
  cities,
  schools,
  strings,
  lockedParent,
  embedded = false,
  hideGrant = false,
  onCreated,
}: {
  grades: GradeOption[];
  subjects: SubjectOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  strings: CreateChildStrings;
  // When set, the parent is fixed (its picker is hidden) — used by the
  // Free-Access wizard so a child is always created under the chosen parent.
  lockedParent?: { id: string; name: string };
  // Render inline (no open button) — the wizard already gates this step.
  embedded?: boolean;
  // Hide the built-in grant-free-access toggle: the wizard grants via its own
  // dedicated Schedule step, so granting here would double-grant.
  hideGrant?: boolean;
  // Fired once when the child is created, handing it up to the caller.
  onCreated?: (child: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Remount key: closing after a success clears the finished action state so
  // the next open starts with a fresh, empty form.
  const [formKey, setFormKey] = useState(0);

  if (!embedded && !open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {strings.open}
      </button>
    );
  }

  return (
    <InnerForm
      key={formKey}
      grades={grades}
      subjects={subjects}
      cities={cities}
      schools={schools}
      strings={strings}
      lockedParent={lockedParent}
      embedded={embedded}
      hideGrant={hideGrant}
      onCreated={onCreated}
      onClose={() => {
        setOpen(false);
        setFormKey((k) => k + 1);
      }}
    />
  );
}

// Live parent autocomplete (debounced server search).
function ParentPicker({ strings }: { strings: CreateChildStrings }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ParentSearchResult[]>([]);
  const [selected, setSelected] = useState<ParentSearchResult | null>(null);
  const [showList, setShowList] = useState(false);
  const [searching, startSearch] = useTransition();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debRef.current) clearTimeout(debRef.current);
  }, []);

  function onChange(v: string) {
    setQ(v);
    setSelected(null);
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
  }

  const contact = (p: ParentSearchResult) =>
    [p.phone, p.email].filter(Boolean).join(" · ");

  return (
    <div className="field parent-picker" style={{ position: "relative" }}>
      <span>{strings.parent}</span>
      {/* The authoritative value the server reads. */}
      <input type="hidden" name="parent_profile_id" value={selected?.id ?? ""} />
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
          onClick={() => {
            setSelected(null);
            setQ("");
          }}
        >
          {strings.parentClear}
        </button>
      )}
      {searching && <p className="muted" style={{ margin: "4px 0" }}>{strings.parentSearching}</p>}
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

function InnerForm({
  grades,
  subjects,
  cities,
  schools,
  strings,
  lockedParent,
  embedded = false,
  hideGrant = false,
  onCreated,
  onClose,
}: {
  grades: GradeOption[];
  subjects: SubjectOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  strings: CreateChildStrings;
  lockedParent?: { id: string; name: string };
  embedded?: boolean;
  hideGrant?: boolean;
  onCreated?: (child: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<CreateChildState, FormData>(
    createChildForParent,
    null,
  );

  // "Grant free access" defaults ON, but is forced OFF (and hidden) when the
  // wizard owns granting via its Schedule step — never double-grant.
  const [grant, setGrant] = useState(!hideGrant);
  const [interval, setInterval] = useState<"week" | "month" | "year">("month");

  // Report the created child up exactly once (studentProfileId comes only from
  // the server action result — never fabricated client-side).
  const firedRef = useRef(false);
  useEffect(() => {
    if (state?.ok && state.studentProfileId && !firedRef.current) {
      firedRef.current = true;
      onCreated?.({ id: state.studentProfileId, name: state.name ?? "" });
    }
  }, [state, onCreated]);

  // City -> School cascade (schools arrive pre-ordered private-first + numeric).
  const [districtId, setDistrictId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const citySchools = useMemo(
    () => (districtId ? schools.filter((s) => s.district_id === districtId) : []),
    [schools, districtId],
  );
  const hasPrivate = citySchools.some((s) => s.is_private);

  // Only subjects with ACTIVE pricing for the chosen interval are offered.
  const intervalSubjects = useMemo(
    () => subjects.filter((s) => s.intervals.includes(interval)),
    [subjects, interval],
  );

  // ---- Success panel (child created) ----------------------------------------
  if (state?.ok) {
    // Embedded (wizard) mode: the wizard advances to its Schedule step via
    // onCreated and collapses this step to a summary — a brief inline
    // confirmation is all that's needed here.
    if (embedded) {
      return (
        <div className="child-created">
          <p className="form-ok">{strings.done}</p>
        </div>
      );
    }
    return (
      <div className="card child-created">
        <p className="form-ok">{strings.done}</p>
        {state.childUniqueId ? (
          <div className="child-created-idbox">
            <span className="child-created-idlabel">{strings.idLabel}</span>
            <span className="child-created-id">{state.childUniqueId}</span>
          </div>
        ) : (
          <p className="muted">{strings.idPending}</p>
        )}
        <p className="child-created-note">{strings.bypassNote}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      className={embedded ? undefined : "card"}
      style={{
        marginTop: embedded ? 0 : 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {!embedded && <h3>{strings.title}</h3>}
      {!hideGrant && <p className="muted child-bypass-intro">{strings.intro}</p>}

      {lockedParent ? (
        <div className="field">
          <span>{strings.parent}</span>
          {/* Parent is fixed by the wizard — submit it hidden, show read-only. */}
          <input type="hidden" name="parent_profile_id" value={lockedParent.id} />
          <div className="fawiz-locked-value">{lockedParent.name}</div>
        </div>
      ) : (
        <ParentPicker strings={strings} />
      )}

      <div className="form-grid">
        <label className="field">
          <span>{strings.firstName}</span>
          <input name="first_name" required maxLength={80} autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.lastName}</span>
          <input name="last_name" required maxLength={80} autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.password}</span>
          <PasswordInput
            name="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            strings={{ show: strings.showPassword, hide: strings.hidePassword }}
          />
          <small className="muted">{strings.passwordHint}</small>
        </label>
        <label className="field">
          <span>{strings.grade}</span>
          <select name="grade_id" defaultValue="">
            <option value="">{strings.gradeNone}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {/* City -> School cascade (both required). */}
        <label className="field">
          <span>{strings.city}</span>
          <select
            name="district_id"
            required
            value={districtId}
            onChange={(e) => {
              setDistrictId(e.target.value);
              setSchoolId("");
            }}
          >
            <option value="" disabled>
              {strings.cityChoose}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{strings.school}</span>
          <select
            name="school_id"
            required
            value={schoolId}
            disabled={!districtId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="" disabled>
              {districtId ? strings.schoolChoose : strings.cityFirst}
            </option>
            {hasPrivate && (
              <optgroup label={strings.privateSchools}>
                {citySchools
                  .filter((s) => s.is_private)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {hasPrivate ? (
              <optgroup label={strings.publicSchools}>
                {citySchools
                  .filter((s) => !s.is_private)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ) : (
              citySchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* Grant free access (payment bypass) — default ON. Hidden entirely when
          the wizard owns granting via its Schedule step (grant forced OFF). */}
      <input type="hidden" name="grant_access" value={grant ? "true" : "false"} />
      {!hideGrant && (
        <>
          <label className="checkbox-chip child-grant-toggle">
            <input
              type="checkbox"
              checked={grant}
              onChange={(e) => setGrant(e.target.checked)}
            />
            <span>{strings.grant}</span>
          </label>
          <p className="muted child-grant-help">{strings.grantHelp}</p>
        </>
      )}

      {!hideGrant && grant && (
        <div className="child-grant-fields">
          <div className="form-grid">
            <label className="field">
              <span>{strings.interval}</span>
              <select
                name="interval"
                value={interval}
                onChange={(e) =>
                  setInterval(e.target.value as "week" | "month" | "year")
                }
              >
                <option value="week">{strings.intervalWeek}</option>
                <option value="month">{strings.intervalMonth}</option>
                <option value="year">{strings.intervalYear}</option>
              </select>
            </label>
            <label className="field">
              <span>{strings.days}</span>
              <input
                type="number"
                name="days"
                min={1}
                max={730}
                step={1}
                placeholder="—"
              />
              <small className="muted">{strings.daysHelp}</small>
            </label>
          </div>

          <div className="field">
            <span>{strings.subjects}</span>
            {intervalSubjects.length === 0 ? (
              <p className="muted">{strings.subjectsNone}</p>
            ) : (
              <div className="checkbox-row" role="group" aria-label={strings.subjects}>
                {intervalSubjects.map((s) => (
                  <label className="checkbox-chip" key={s.id}>
                    <input type="checkbox" name="subject" value={s.id} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.submitting : strings.submit}
        </button>
        {!embedded && (
          <button type="button" className="btn-ghost" onClick={onClose}>
            {strings.cancel}
          </button>
        )}
        {state?.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
