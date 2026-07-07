"use client";

// Free-Access GUIDED WIZARD (Admin-only). Round 12.2 — replaces the three
// independent stacked sections with a single sequential stepper:
//
//   Step 1 — Parent  →  Step 2 — Child  →  Step 3 — Schedule free access
//
// Hard rules (owner): you cannot reach the Child step without a parent; an
// EXISTING child must belong to the chosen parent (guaranteed because its list
// comes from getParentChildren(parent)); scheduling only unlocks once BOTH a
// parent and a child target are set. Editing an earlier step resets later ones.
//
// Pure UI ORCHESTRATION only: every server action (createParent /
// createChildForParent / createFreeAccessInterval) keeps its own authorization
// and validation. The created parent/child ids flow ONLY from server-action
// results — never fabricated here.
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  useActionState,
} from "react";
import {
  AccountCreateForm,
  type AccountCreateStrings,
} from "@/components/AccountCreateForm";
import {
  CreateChildForm,
  type GradeOption,
  type SubjectOption,
  type CityOption,
  type SchoolOpt,
  type CreateChildStrings,
} from "@/components/CreateChildForm";
import {
  IntervalsTable,
  toUtcIso,
  type FreeAccessStrings,
} from "@/components/FreeAccessManager";
import { searchParents, type ParentSearchResult } from "@/lib/admin/accounts";
import {
  createFreeAccessInterval,
  getParentChildren,
  type ChildOption,
  type CreateFreeAccessState,
  type FreeAccessRow,
} from "@/lib/admin/freeAccess";

export type FreeAccessWizardStrings = {
  intro: string;
  step1Title: string; // "Parent"
  step2Title: string; // "Child"
  step3Title: string; // "Schedule free access"
  parentNew: string; // "Create new parent"
  parentExisting: string; // "Use existing parent"
  childNew: string; // "Create new child"
  childExisting: string; // "Choose existing child"
  childAllMode: string; // "All children"
  childChoose: string; // select placeholder "Select a child…"
  childNone: string; // "This parent has no children yet."
  lockedParent: string; // "Choose a parent first."
  lockedChild: string; // "Choose a child target first."
  allChildrenOf: string; // "All children of {name}"
  change: string; // "Change"
  startOver: string; // "Start over"
  continue: string; // "Continue"
  scheduleFor: string; // "Scheduling for"
};

type SelectedParent = { id: string; name: string };
type ChildTarget =
  | { mode: "one"; studentId: string; name: string }
  | { mode: "all" };
type Phase = "active" | "done" | "locked";

export function FreeAccessWizard({
  grades,
  subjects,
  cities,
  schools,
  intervals,
  locale,
  accountStrings,
  childStrings,
  freeAccessStrings,
  wizardStrings,
}: {
  grades: GradeOption[];
  subjects: SubjectOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  intervals: FreeAccessRow[];
  locale: string;
  accountStrings: AccountCreateStrings;
  childStrings: CreateChildStrings;
  freeAccessStrings: FreeAccessStrings;
  wizardStrings: FreeAccessWizardStrings;
}) {
  const s = wizardStrings;
  const [selectedParent, setSelectedParent] = useState<SelectedParent | null>(
    null,
  );
  const [childTarget, setChildTarget] = useState<ChildTarget | null>(null);

  const step1Done = !!selectedParent;
  const step2Done = !!childTarget;
  // The active step is always the first unsatisfied one.
  const activeStep: 1 | 2 | 3 = !step1Done ? 1 : !step2Done ? 2 : 3;

  const step1Phase: Phase = step1Done ? "done" : "active";
  const step2Phase: Phase = !step1Done ? "locked" : step2Done ? "done" : "active";
  const step3Phase: Phase = step1Done && step2Done ? "active" : "locked";

  // Editing an earlier step resets every later selection.
  function changeParent() {
    setSelectedParent(null);
    setChildTarget(null);
  }
  function changeChild() {
    setChildTarget(null);
  }
  function startOver() {
    setSelectedParent(null);
    setChildTarget(null);
  }

  const childSummary = childTarget
    ? childTarget.mode === "one"
      ? childTarget.name
      : s.allChildrenOf.replace("{name}", selectedParent?.name ?? "")
    : undefined;

  return (
    <div className="fawiz">
      {s.intro && <p className="muted fawiz-intro">{s.intro}</p>}

      <StepIndicator
        activeStep={activeStep}
        step1Done={step1Done}
        step2Done={step2Done}
        titles={[s.step1Title, s.step2Title, s.step3Title]}
      />

      {/* Step 1 — Parent */}
      <StepShell
        n={1}
        title={s.step1Title}
        phase={step1Phase}
        summary={selectedParent?.name}
        onChange={changeParent}
        changeLabel={s.change}
      >
        <ParentStep
          accountStrings={accountStrings}
          freeAccessStrings={freeAccessStrings}
          wizardStrings={wizardStrings}
          onParent={(p) => setSelectedParent(p)}
        />
      </StepShell>

      {/* Step 2 — Child */}
      <StepShell
        n={2}
        title={s.step2Title}
        phase={step2Phase}
        summary={childSummary}
        lockedHint={s.lockedParent}
        onChange={changeChild}
        changeLabel={s.change}
      >
        {selectedParent && (
          <ChildStep
            parent={selectedParent}
            grades={grades}
            subjects={subjects}
            cities={cities}
            schools={schools}
            childStrings={childStrings}
            freeAccessStrings={freeAccessStrings}
            wizardStrings={wizardStrings}
            onTarget={(t) => setChildTarget(t)}
          />
        )}
      </StepShell>

      {/* Step 3 — Schedule */}
      <StepShell
        n={3}
        title={s.step3Title}
        phase={step3Phase}
        lockedHint={s.lockedChild}
      >
        {selectedParent && childTarget && (
          <ScheduleStep
            parent={selectedParent}
            childTarget={childTarget}
            freeAccessStrings={freeAccessStrings}
            wizardStrings={wizardStrings}
            onStartOver={startOver}
          />
        )}
      </StepShell>

      {/* Existing scheduled/active windows (with the Deactivate action). */}
      <section className="card">
        <h3>{freeAccessStrings.listHeading}</h3>
        <IntervalsTable
          intervals={intervals}
          locale={locale}
          strings={freeAccessStrings}
        />
      </section>
    </div>
  );
}

// Compact top progress strip: 1 Parent · 2 Child · 3 Schedule.
function StepIndicator({
  activeStep,
  step1Done,
  step2Done,
  titles,
}: {
  activeStep: 1 | 2 | 3;
  step1Done: boolean;
  step2Done: boolean;
  titles: [string, string, string];
}) {
  const items = [
    { n: 1, title: titles[0], done: step1Done },
    { n: 2, title: titles[1], done: step2Done },
    { n: 3, title: titles[2], done: false },
  ];
  return (
    <ol className="fawiz-steps">
      {items.map((it) => {
        const phase: Phase = it.done
          ? "done"
          : it.n === activeStep
            ? "active"
            : "locked";
        return (
          <li key={it.n} className={`fawiz-stepchip fawiz-stepchip-${phase}`}>
            <span className="fawiz-stepchip-num">{it.done ? "✓" : it.n}</span>
            <span className="fawiz-stepchip-title">{it.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

// One step card: shows the working form (active), a collapsed summary + Change
// (done), or a muted locked hint (locked).
function StepShell({
  n,
  title,
  phase,
  summary,
  lockedHint,
  onChange,
  changeLabel,
  children,
}: {
  n: number;
  title: string;
  phase: Phase;
  summary?: string;
  lockedHint?: string;
  onChange?: () => void;
  changeLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`card fawiz-step fawiz-step-${phase}`}>
      <div className="fawiz-step-head">
        <span className="fawiz-step-num">{phase === "done" ? "✓" : n}</span>
        <h3 className="fawiz-step-title">{title}</h3>
        {phase === "done" && onChange && (
          <button
            type="button"
            className="btn-ghost btn-sm fawiz-change"
            onClick={onChange}
          >
            {changeLabel}
          </button>
        )}
      </div>
      {phase === "done" && summary && (
        <p className="fawiz-summary-text">{summary}</p>
      )}
      {phase === "locked" && lockedHint && (
        <p className="muted fawiz-locked-hint">{lockedHint}</p>
      )}
      {phase === "active" && <div className="fawiz-step-body">{children}</div>}
    </section>
  );
}

// Segmented mode toggle (used in the Parent + Child steps).
function ModeToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="fawiz-modes" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? "fawiz-mode active" : "fawiz-mode"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Step 1 body -----------------------------------------------------------
function ParentStep({
  accountStrings,
  freeAccessStrings,
  wizardStrings,
  onParent,
}: {
  accountStrings: AccountCreateStrings;
  freeAccessStrings: FreeAccessStrings;
  wizardStrings: FreeAccessWizardStrings;
  onParent: (p: SelectedParent) => void;
}) {
  // Default to "existing" — most free-access grants target an account that
  // already exists, and it avoids accidental duplicate parents.
  const [mode, setMode] = useState<"existing" | "new">("existing");
  return (
    <>
      <ModeToggle
        options={[
          { value: "existing", label: wizardStrings.parentExisting },
          { value: "new", label: wizardStrings.parentNew },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "new" ? (
        <AccountCreateForm strings={accountStrings} embedded onCreated={onParent} />
      ) : (
        <ExistingParentPicker
          strings={{
            parentSearch: freeAccessStrings.parentSearch,
            parentSearching: freeAccessStrings.parentSearching,
            parentEmpty: freeAccessStrings.parentEmpty,
            parentChildren: freeAccessStrings.parentChildren,
          }}
          onPick={onParent}
        />
      )}
    </>
  );
}

// Debounced existing-parent search (mirrors the FreeAccessManager ParentPicker,
// but lifts the selection straight up via onPick — no hidden form input needed).
function ExistingParentPicker({
  strings,
  onPick,
}: {
  strings: {
    parentSearch: string;
    parentSearching: string;
    parentEmpty: string;
    parentChildren: string;
  };
  onPick: (p: SelectedParent) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ParentSearchResult[]>([]);
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

  const contact = (p: ParentSearchResult) =>
    [p.phone, p.email].filter(Boolean).join(" · ");

  return (
    <div className="field parent-picker" style={{ position: "relative" }}>
      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowList(true)}
        placeholder={strings.parentSearch}
        autoComplete="off"
        aria-label={strings.parentSearch}
      />
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
                  onClick={() => onPick({ id: p.id, name: p.name })}
                >
                  <span className="parent-result-name">{p.name}</span>
                  {contact(p) && (
                    <span className="parent-result-contact muted">
                      {contact(p)}
                    </span>
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

// ---- Step 2 body -----------------------------------------------------------
function ChildStep({
  parent,
  grades,
  subjects,
  cities,
  schools,
  childStrings,
  freeAccessStrings,
  wizardStrings,
  onTarget,
}: {
  parent: SelectedParent;
  grades: GradeOption[];
  subjects: SubjectOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  childStrings: CreateChildStrings;
  freeAccessStrings: FreeAccessStrings;
  wizardStrings: FreeAccessWizardStrings;
  onTarget: (t: ChildTarget) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing" | "all">("new");
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [loading, startLoad] = useTransition();
  const [studentId, setStudentId] = useState("");

  // Loading via getParentChildren(parent.id) GUARANTEES every listed child
  // belongs to the chosen parent (the owner's linkage rule for existing kids).
  useEffect(() => {
    startLoad(async () => {
      const kids = await getParentChildren(parent.id);
      setChildren(kids);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.id]);

  return (
    <>
      <ModeToggle
        options={[
          { value: "new", label: wizardStrings.childNew },
          { value: "existing", label: wizardStrings.childExisting },
          { value: "all", label: wizardStrings.childAllMode },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "new" && (
        <CreateChildForm
          grades={grades}
          subjects={subjects}
          cities={cities}
          schools={schools}
          strings={childStrings}
          lockedParent={parent}
          embedded
          hideGrant
          onCreated={(c) =>
            onTarget({ mode: "one", studentId: c.id, name: c.name })
          }
        />
      )}

      {mode === "existing" && (
        <div className="fawiz-existing-child">
          {loading ? (
            <p className="muted">{freeAccessStrings.childLoading}</p>
          ) : children.length === 0 ? (
            <p className="muted">{wizardStrings.childNone}</p>
          ) : (
            <>
              <label className="field">
                <span>{wizardStrings.step2Title}</span>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">{wizardStrings.childChoose}</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={!studentId}
                  onClick={() => {
                    const chosen = children.find((c) => c.id === studentId);
                    if (chosen)
                      onTarget({
                        mode: "one",
                        studentId: chosen.id,
                        name: chosen.name,
                      });
                  }}
                >
                  {wizardStrings.continue}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "all" && (
        <div className="fawiz-all-children">
          <p className="muted">
            {wizardStrings.allChildrenOf.replace("{name}", parent.name)}
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={() => onTarget({ mode: "all" })}
            >
              {wizardStrings.continue}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Step 3 body -----------------------------------------------------------
// Keyed wrapper so "Schedule another" clears the finished action state while
// keeping the same parent/child selection.
function ScheduleStep({
  parent,
  childTarget,
  freeAccessStrings,
  wizardStrings,
  onStartOver,
}: {
  parent: SelectedParent;
  childTarget: ChildTarget;
  freeAccessStrings: FreeAccessStrings;
  wizardStrings: FreeAccessWizardStrings;
  onStartOver: () => void;
}) {
  const [formKey, setFormKey] = useState(0);
  return (
    <ScheduleForm
      key={formKey}
      parent={parent}
      childTarget={childTarget}
      freeAccessStrings={freeAccessStrings}
      wizardStrings={wizardStrings}
      onScheduleAnother={() => setFormKey((k) => k + 1)}
      onStartOver={onStartOver}
    />
  );
}

function ScheduleForm({
  parent,
  childTarget,
  freeAccessStrings,
  wizardStrings,
  onScheduleAnother,
  onStartOver,
}: {
  parent: SelectedParent;
  childTarget: ChildTarget;
  freeAccessStrings: FreeAccessStrings;
  wizardStrings: FreeAccessWizardStrings;
  onScheduleAnother: () => void;
  onStartOver: () => void;
}) {
  const fa = freeAccessStrings;
  const [state, action, pending] = useActionState<CreateFreeAccessState, FormData>(
    createFreeAccessInterval,
    null,
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Empty student id = grant to ALL children of the parent (action semantics).
  const studentId = childTarget.mode === "one" ? childTarget.studentId : "";
  const recap =
    childTarget.mode === "one"
      ? childTarget.name
      : wizardStrings.allChildrenOf.replace("{name}", parent.name);

  // Client guard: end must be strictly after start (server re-validates).
  const endInvalid = Boolean(
    start && end && new Date(end).getTime() <= new Date(start).getTime(),
  );
  const canSubmit = Boolean(start && end) && !endInvalid && !pending;

  if (state?.ok) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="form-ok">{fa.created}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onScheduleAnother}>
            {fa.scheduleAnother}
          </button>
          <button type="button" className="btn-ghost" onClick={onStartOver}>
            {wizardStrings.startOver}
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
      <p className="fawiz-recap">
        {wizardStrings.scheduleFor}: <strong>{recap}</strong>
      </p>

      {/* Authoritative targets — parent from step 1, child target from step 2. */}
      <input type="hidden" name="parent_profile_id" value={parent.id} />
      <input type="hidden" name="student_profile_id" value={studentId} />
      {/* datetime-local holds NAIVE local time; submit UTC-normalized ISO. */}
      <input type="hidden" name="starts_at" value={toUtcIso(start)} />
      <input type="hidden" name="ends_at" value={toUtcIso(end)} />

      <div className="form-grid">
        <label className="field">
          <span>{fa.start}</span>
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{fa.end}</span>
          <input
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      {endInvalid && <p className="form-error">{fa.endBeforeStart}</p>}

      <label className="field">
        <span>{fa.note}</span>
        <input
          name="note"
          maxLength={300}
          autoComplete="off"
          placeholder={fa.notePlaceholder}
        />
      </label>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={!canSubmit}>
          {pending ? fa.creating : fa.create}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
