"use client";

// Notification composer (Admin-only). Pure UI: ALL validation/authorization lives
// in the lib/admin/notifications server actions. Reuses the debounced
// searchParents autocomplete (same server search + .parent-picker CSS as the
// admin Add-Child / Free-Access forms) for the "specific parent(s)" audience,
// which supports selecting MULTIPLE parents (a deduped chip list).
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { searchParents, type ParentSearchResult } from "@/lib/admin/accounts";
import {
  sendNotification,
  previewCount,
  type SendNotificationState,
} from "@/lib/admin/notifications";
import { renderNotificationMarkdown } from "@/lib/admin/notif-markdown";

// Naive "2026-07-07T14:30" → UTC ISO, interpreted in the admin's browser tz.
// Mirrors FreeAccessManager.toUtcIso so the server never applies a TZ shift.
function toUtcIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export type SubjectOption = { id: string; name: string };
// ACTIVE olympiad packages for the "olympiad buyers" audience (az titles).
export type PackageOption = { id: string; title: string };
export type TemplateRow = {
  id: string;
  code: string;
  locale: string;
  subject: string | null;
  body: string;
};

export type ComposerStrings = {
  heading: string;
  template: string;
  templateNone: string;
  templateHint: string;
  title: string;
  titlePlaceholder: string;
  body: string;
  bodyPlaceholder: string;
  // Rich-text toolbar (minimal markdown) above the body field.
  toolbarBold: string;
  toolbarItalic: string;
  toolbarLink: string;
  linkPrompt: string; // window.prompt asking for the link URL
  channels: string;
  channelInApp: string;
  channelEmail: string;
  channelPush: string;
  channelInAppNote: string;
  channelOffNote: string;
  audience: string;
  audAllUsers: string;
  audAllParents: string;
  audAllChildren: string;
  audOlympiadBuyers: string;
  audParent: string;
  audBySubject: string;
  audAdministrators: string;
  audContentManagers: string;
  subject: string;
  subjectChoose: string;
  // Olympiad package picker (multi-select for the olympiad_buyers audience)
  pkgLabel: string;
  pkgSearch: string;
  pkgEmpty: string; // no active packages exist at all
  pkgNoMatch: string; // search filtered everything out
  pkgChosen: string; // "{n} selected"
  pkgSelectAll: string;
  pkgClear: string;
  pkgRemove: string; // aria-label for a single chip's × button
  pkgHint: string;
  zeroRecipients: string; // warning when the live count is 0
  recipients: string; // "{n} recipients"
  recipientsCounting: string;
  recipientsPick: string; // shown until a target is chosen
  schedule: string;
  scheduleHint: string;
  preview: string;
  previewEmpty: string;
  send: string;
  sendScheduled: string;
  sending: string;
  sentNow: string; // "Sent to {n} recipients."
  scheduled: string; // "Scheduled — {n} recipients."
  confirmLarge: string; // "About to notify {n} people. Continue?"
  composeAnother: string;
  // Parent picker (multi-select)
  parentSearch: string;
  parentSearching: string;
  parentEmpty: string;
  parentClear: string; // "Clear all" selected parents
  parentRemove: string; // aria-label for a single chip's × button
  parentChosen: string; // "{n} selected"
  parentAddHint: string; // hint under the search box
  parentChildren: string; // "{n} children"
};

// Audiences that need a chosen target before a count is meaningful.
const NEEDS_TARGET = new Set(["parent", "by_subject", "olympiad_buyers"]);
// Above this many recipients a send is confirmed before dispatch.
const LARGE_AUDIENCE = 50;

type AudienceType =
  | "all_users"
  | "all_parents"
  | "all_children"
  | "olympiad_buyers"
  | "parent"
  | "by_subject"
  | "administrators"
  | "content_managers";

export function NotificationComposer({
  subjects,
  packages,
  templates,
  strings,
}: {
  subjects: SubjectOption[];
  packages: PackageOption[];
  templates: TemplateRow[];
  strings: ComposerStrings;
}) {
  const [formKey, setFormKey] = useState(0);
  return (
    <ComposerForm
      key={formKey}
      subjects={subjects}
      packages={packages}
      templates={templates}
      strings={strings}
      onReset={() => setFormKey((k) => k + 1)}
    />
  );
}

function fmtCount(tpl: string, n: number): string {
  return tpl.replace("{n}", String(n));
}

function ComposerForm({
  subjects,
  packages,
  templates,
  strings,
  onReset,
}: {
  subjects: SubjectOption[];
  packages: PackageOption[];
  templates: TemplateRow[];
  strings: ComposerStrings;
  onReset: () => void;
}) {
  const [state, action, pending] = useActionState<SendNotificationState, FormData>(
    sendNotification,
    null,
  );

  const [templateCode, setTemplateCode] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(false);
  const [push, setPush] = useState(false);
  const [audience, setAudience] = useState<AudienceType>("all_parents");
  const [parents, setParents] = useState<ParentSearchResult[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("");

  const [count, setCount] = useState<number | null>(null);
  const [counting, startCount] = useTransition();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Deduped add / remove for the multi-parent chip list.
  function addParent(p: ParentSearchResult) {
    setParents((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p]));
  }
  function removeParent(id: string) {
    setParents((cur) => cur.filter((x) => x.id !== id));
  }

  // Rich-text (minimal markdown) toolbar — wrap/replace the current textarea
  // selection, then restore focus/selection after React re-renders.
  const BODY_MAX = 2000;
  function surround(before: string, after: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = body.slice(start, end);
    const next = (
      body.slice(0, start) +
      before +
      sel +
      after +
      body.slice(end)
    ).slice(0, BODY_MAX);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const a = start + before.length;
      ta.setSelectionRange(a, a + sel.length);
    });
  }
  function insertLink() {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = body.slice(start, end);
    const url = window.prompt(strings.linkPrompt, "https://");
    if (!url) return;
    const md = `[${sel || "link"}](${url.trim()})`;
    const next = (body.slice(0, start) + md + body.slice(end)).slice(0, BODY_MAX);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = Math.min(start + md.length, BODY_MAX);
      ta.setSelectionRange(pos, pos);
    });
  }

  // Distinct template codes (the az row drives the picker; picking loads az
  // subject → title and az body → body).
  const codes = Array.from(new Set(templates.map((tpl) => tpl.code))).sort();
  function applyTemplate(code: string) {
    setTemplateCode(code);
    if (!code) return;
    const az =
      templates.find((tpl) => tpl.code === code && tpl.locale === "az") ??
      templates.find((tpl) => tpl.code === code);
    if (az) {
      if (az.subject) setTitle(az.subject);
      setBody(az.body);
    }
  }

  // Deduped toggle / select-all / clear for the olympiad package multi-select.
  function togglePackage(id: string) {
    setPackageIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  // Live recipient count — debounced, recomputed on audience/target change.
  // For "specific parent(s)" / "olympiad buyers" the target key is the joined
  // list of picked ids, so the count updates as items are added / removed.
  const parentKey = parents.map((p) => p.id).join(",");
  const packageKey = packageIds.join(",");
  const targetId =
    audience === "by_subject"
      ? subjectId
      : audience === "parent"
        ? parentKey
        : audience === "olympiad_buyers"
          ? packageKey
          : "";
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (NEEDS_TARGET.has(audience) && !targetId) {
      setCount(null);
      return;
    }
    debRef.current = setTimeout(() => {
      startCount(async () => {
        const n = await previewCount(audience, {
          profile_ids: audience === "parent" ? parents.map((p) => p.id) : undefined,
          subject_id: audience === "by_subject" ? subjectId : undefined,
          package_ids:
            audience === "olympiad_buyers" ? packageIds : undefined,
        });
        setCount(n);
      });
    }, 300);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, targetId]);

  const targetChosen = !NEEDS_TARGET.has(audience) || Boolean(targetId);
  const canSubmit =
    Boolean(title.trim() && body.trim()) && targetChosen && !pending;

  // Success banner (sent now / scheduled).
  if (state?.ok) {
    const n = state.recipients ?? 0;
    const msg =
      state.status === "scheduled"
        ? fmtCount(strings.scheduled, n)
        : fmtCount(strings.sentNow, n);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="form-ok">{msg}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onReset}>
            {strings.composeAnother}
          </button>
        </div>
      </div>
    );
  }

  const countLabel = counting
    ? strings.recipientsCounting
    : count === null
      ? strings.recipientsPick
      : fmtCount(strings.recipients, count);

  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => {
        // Confirm before a large / broadcast send (only once a real count > 0 is
        // known — a null count means nothing to warn about yet).
        const n = count ?? 0;
        const broadcast =
          audience === "all_users" ||
          audience === "all_parents" ||
          audience === "all_children";
        if ((broadcast || n >= LARGE_AUDIENCE) && n > 0) {
          const ok = window.confirm(fmtCount(strings.confirmLarge, n));
          if (!ok) e.preventDefault();
        }
      }}
    >
      {/* Authoritative values the server reads. */}
      <input type="hidden" name="audience_type" value={audience} />
      {/* Comma-joined UUIDs of the selected parents (server re-validates each). */}
      <input
        type="hidden"
        name="profile_ids"
        value={audience === "parent" ? parentKey : ""}
      />
      <input
        type="hidden"
        name="subject_id"
        value={audience === "by_subject" ? subjectId : ""}
      />
      {/* Comma-joined UUIDs of the selected olympiad packages + a JSON title
          snapshot for the history view (server re-validates the ids; the DB
          resolver ignores the extra titles key). */}
      <input
        type="hidden"
        name="package_ids"
        value={audience === "olympiad_buyers" ? packageKey : ""}
      />
      <input
        type="hidden"
        name="package_titles"
        value={
          audience === "olympiad_buyers"
            ? JSON.stringify(
                packages
                  .filter((p) => packageIds.includes(p.id))
                  .map((p) => p.title),
              )
            : ""
        }
      />
      <input type="hidden" name="template_code" value={templateCode} />
      <input type="hidden" name="scheduled_at" value={toUtcIso(schedule)} />
      {/* in_app is always on — a disabled checkbox would not submit, so mirror it. */}
      <input type="hidden" name="channel" value="in_app" />
      {email && <input type="hidden" name="channel" value="email" />}
      {push && <input type="hidden" name="channel" value="push" />}

      {/* Template picker (optional) */}
      {codes.length > 0 && (
        <label className="field">
          <span>{strings.template}</span>
          <select
            value={templateCode}
            onChange={(e) => applyTemplate(e.target.value)}
          >
            <option value="">{strings.templateNone}</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {strings.templateHint}
          </span>
        </label>
      )}

      <label className="field">
        <span>{strings.title}</span>
        <input
          name="title"
          maxLength={200}
          required
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={strings.titlePlaceholder}
        />
      </label>

      <label className="field">
        <span>{strings.body}</span>
        <div
          className="checkbox-row"
          style={{ gap: 6, marginBottom: 2 }}
          role="toolbar"
          aria-label={strings.body}
        >
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "2px 10px", fontWeight: 700 }}
            title={strings.toolbarBold}
            aria-label={strings.toolbarBold}
            onClick={() => surround("**", "**")}
          >
            B
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "2px 10px", fontStyle: "italic" }}
            title={strings.toolbarItalic}
            aria-label={strings.toolbarItalic}
            onClick={() => surround("*", "*")}
          >
            I
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "2px 10px" }}
            title={strings.toolbarLink}
            aria-label={strings.toolbarLink}
            onClick={insertLink}
          >
            {strings.toolbarLink}
          </button>
        </div>
        <textarea
          ref={bodyRef}
          name="body"
          maxLength={2000}
          rows={4}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={strings.bodyPlaceholder}
        />
      </label>

      {/* Channels */}
      <div className="field">
        <span>{strings.channels}</span>
        <div className="checkbox-row">
          <label className="checkbox-chip">
            <input type="checkbox" checked disabled readOnly />
            <span>{strings.channelInApp}</span>
          </label>
          <label className="checkbox-chip">
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
            />
            <span>{strings.channelEmail}</span>
          </label>
          <label className="checkbox-chip">
            <input
              type="checkbox"
              checked={push}
              onChange={(e) => setPush(e.target.checked)}
            />
            <span>{strings.channelPush}</span>
          </label>
        </div>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          {strings.channelInAppNote}
        </span>
        {(email || push) && (
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {strings.channelOffNote}
          </span>
        )}
      </div>

      {/* Audience */}
      <div className="field">
        <span>{strings.audience}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Fixed audience ORDER (owner-specified): all users, all parents,
              all children, olympiad buyers, specific parent(s), by subject —
              plus the two staff audiences (migration 076) appended at the
              end: administrators, content managers. */}
          {(
            [
              ["all_users", strings.audAllUsers],
              ["all_parents", strings.audAllParents],
              ["all_children", strings.audAllChildren],
              ["olympiad_buyers", strings.audOlympiadBuyers],
              ["parent", strings.audParent],
              ["by_subject", strings.audBySubject],
              ["administrators", strings.audAdministrators],
              ["content_managers", strings.audContentManagers],
            ] as [AudienceType, string][]
          ).map(([value, label]) => (
            <label
              key={value}
              className="checkbox-chip"
              style={{ justifyContent: "flex-start" }}
            >
              <input
                type="radio"
                name="__audience"
                checked={audience === value}
                onChange={() => {
                  setAudience(value);
                  setCount(null);
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Target for the "specific parent(s)" audience — multi-select. */}
      {audience === "parent" && (
        <ParentPicker
          strings={strings}
          selected={parents}
          onAdd={addParent}
          onRemove={removeParent}
          onClear={() => setParents([])}
        />
      )}

      {/* Target for by_subject */}
      {audience === "by_subject" && (
        <label className="field">
          <span>{strings.subject}</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">{strings.subjectChoose}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Target for olympiad_buyers — searchable multi-select of ACTIVE
          packages with chips + select all / clear all. */}
      {audience === "olympiad_buyers" && (
        <PackagePicker
          strings={strings}
          packages={packages}
          selected={packageIds}
          onToggle={togglePackage}
          onSelectAll={() => setPackageIds(packages.map((p) => p.id))}
          onClear={() => setPackageIds([])}
        />
      )}

      {/* Live recipient count */}
      <p className="muted" style={{ margin: 0 }}>
        <strong>{countLabel}</strong>
      </p>
      {/* Zero-recipient warning: the target is fully chosen, the count query
          finished, and nobody would receive this send. */}
      {!counting && targetChosen && count === 0 && (
        <p className="form-error" style={{ margin: 0 }} role="alert">
          {strings.zeroRecipients}
        </p>
      )}

      {/* Optional schedule */}
      <label className="field">
        <span>{strings.schedule}</span>
        <input
          type="datetime-local"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        />
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          {strings.scheduleHint}
        </span>
      </label>

      {/* Live preview */}
      <div className="card" style={{ background: "var(--surface-2, transparent)" }}>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          {strings.preview}
        </span>
        {title.trim() || body.trim() ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 600 }}>{title || "—"}</div>
            {/* Body renders the minimal markdown SAFELY: escape-then-format,
                so this HTML only ever contains the tags we generate. */}
            <div
              style={{ whiteSpace: "pre-wrap", marginTop: 4 }}
              dangerouslySetInnerHTML={{
                __html: renderNotificationMarkdown(body),
              }}
            />
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {strings.previewEmpty}
          </p>
        )}
      </div>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={!canSubmit}>
          {pending
            ? strings.sending
            : schedule
              ? strings.sendScheduled
              : strings.send}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}

// Multi-select of ACTIVE olympiad packages for the "olympiad buyers" audience:
// client-side search over the (small) package list, a checkbox list, selected
// chips with per-chip remove, plus select-all / clear-all. The selection is
// submitted as comma-joined uuids + a JSON title snapshot (the server
// re-validates every id; the RPC re-checks ACTIVE status).
function PackagePicker({
  strings,
  packages,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  strings: ComposerStrings;
  packages: PackageOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? packages.filter((p) => p.title.toLowerCase().includes(term))
    : packages;
  const byId = new Map(packages.map((p) => [p.id, p]));

  return (
    <div className="field">
      <span>{strings.pkgLabel}</span>

      {packages.length === 0 ? (
        <p className="muted" style={{ margin: "4px 0" }}>
          {strings.pkgEmpty}
        </p>
      ) : (
        <>
          {/* Selected packages — chip list with per-chip remove + clear-all. */}
          {selected.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              {selected.map((id) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <span
                    key={id}
                    className="checkbox-chip"
                    style={{ gap: 6, padding: "4px 8px" }}
                  >
                    <span>{p.title}</span>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: "0 4px", lineHeight: 1, fontSize: "1rem" }}
                      aria-label={strings.pkgRemove}
                      title={strings.pkgRemove}
                      onClick={() => onToggle(id)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={strings.pkgSearch}
            autoComplete="off"
            aria-label={strings.pkgSearch}
          />

          <div
            role="group"
            aria-label={strings.pkgLabel}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 220,
              overflowY: "auto",
              marginTop: 6,
            }}
          >
            {shown.length === 0 && (
              <p className="muted" style={{ margin: "4px 0" }}>
                {strings.pkgNoMatch}
              </p>
            )}
            {shown.map((p) => (
              <label
                key={p.id}
                className="checkbox-chip"
                style={{ justifyContent: "flex-start" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                />
                <span>{p.title}</span>
              </label>
            ))}
          </div>

          <div className="row-actions" style={{ gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "2px 8px", fontSize: "0.8rem" }}
              onClick={onSelectAll}
            >
              {strings.pkgSelectAll}
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "2px 8px", fontSize: "0.8rem" }}
                onClick={onClear}
              >
                {strings.pkgClear}
              </button>
            )}
          </div>

          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {selected.length > 0
              ? fmtCount(strings.pkgChosen, selected.length)
              : strings.pkgHint}
          </span>
        </>
      )}
    </div>
  );
}

// Live parent autocomplete (debounced server search) — mirrors the Free-Access
// ParentPicker, but MULTI-SELECT: each pick appends the parent to a deduped chip
// list (managed by the parent component). The search box stays usable so more
// parents can be added.
function ParentPicker({
  strings,
  selected,
  onAdd,
  onRemove,
  onClear,
}: {
  strings: ComposerStrings;
  selected: ParentSearchResult[];
  onAdd: (p: ParentSearchResult) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
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
    debRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchParents(term);
        setResults(r);
        setShowList(true);
      });
    }, 300);
  }

  // Append to the chip list, then reset the search so another parent can be
  // found. Already-selected parents are deduped by the parent component.
  function pick(p: ParentSearchResult) {
    onAdd(p);
    setQ("");
    setResults([]);
    setShowList(false);
  }

  const contact = (p: ParentSearchResult) =>
    [p.phone, p.email].filter(Boolean).join(" · ");

  return (
    <div className="field parent-picker" style={{ position: "relative" }}>
      <span>{strings.audParent}</span>

      {/* Selected parents — chip list with per-chip remove + clear-all. */}
      {selected.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          {selected.map((p) => (
            <span
              key={p.id}
              className="checkbox-chip"
              style={{ gap: 6, padding: "4px 8px" }}
            >
              <span>{p.name}</span>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "0 4px", lineHeight: 1, fontSize: "1rem" }}
                aria-label={strings.parentRemove}
                title={strings.parentRemove}
                onClick={() => onRemove(p.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            onClick={onClear}
          >
            {strings.parentClear}
          </button>
        </div>
      )}

      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowList(true)}
        placeholder={strings.parentSearch}
        autoComplete="off"
        aria-label={strings.parentSearch}
      />
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        {selected.length > 0
          ? fmtCount(strings.parentChosen, selected.length)
          : strings.parentAddHint}
      </span>
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
            results.map((p) => {
              const already = selected.some((x) => x.id === p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="parent-result"
                    role="option"
                    aria-selected={already}
                    disabled={already}
                    onClick={() => pick(p)}
                  >
                    <span className="parent-result-name">{p.name}</span>
                    {contact(p) && (
                      <span className="parent-result-contact muted">
                        {contact(p)}
                      </span>
                    )}
                    <span className="parent-result-count muted">
                      {fmtCount(strings.parentChildren, p.childCount)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
