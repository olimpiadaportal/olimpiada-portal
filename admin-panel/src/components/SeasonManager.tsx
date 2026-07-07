"use client";

// Named-season CRUD UI (Admin-only) for the /leaderboard page. Pure UI: ALL
// validation/authorization lives in the lib/admin/leaderboard server actions.
//   - "New season" opens the shared Modal with name + start/end (datetime-local);
//   - each row shows its window (formatted in Asia/Baku), a derived status pill
//     and per-row actions (view standings / edit / close / reopen / delete);
//   - Edit and Close are disabled on a closed season; Reopen only shows there.
// Timestamps arrive as ISO strings; the datetime-local inputs hold NAIVE local
// time, so the client converts to a UTC ISO string (interpreted in the admin's
// own browser timezone) and submits it via hidden fields — mirroring
// FreeAccessManager — so the server never applies a TZ-offset shift.
import { useEffect, useState, useTransition, useActionState } from "react";
import { Modal } from "@/components/Modal";
import {
  createSeason,
  updateSeason,
  deleteSeason,
  closeSeason,
  reopenSeason,
  fetchSeasonStandings,
  type SeasonRow,
  type SeasonActionState,
  type SeasonStandingRow,
} from "@/lib/admin/leaderboard";

// Naive "2026-07-05T14:30" → UTC ISO, interpreted in the admin's browser tz.
function toUtcIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export type SeasonStrings = {
  new: string;
  newTitle: string;
  editTitle: string;
  name: string;
  namePlaceholder: string;
  start: string;
  end: string;
  create: string;
  creating: string;
  created: string;
  save: string;
  saving: string;
  saved: string;
  endBeforeStart: string;
  empty: string;
  colName: string;
  colWindow: string;
  colStatus: string;
  actions: string;
  statusUpcoming: string;
  statusActive: string;
  statusEnded: string;
  statusClosed: string;
  actionView: string;
  actionEdit: string;
  actionClose: string;
  actionReopen: string;
  actionDelete: string;
  closeTitle: string;
  closeText: string;
  closeConfirm: string;
  closeDone: string;
  reopenTitle: string;
  reopenText: string;
  reopenConfirm: string;
  reopenDone: string;
  deleteTitle: string;
  deleteText: string;
  deleteConfirm: string;
  deleteDone: string;
  standingsTitle: string;
  standingsRank: string;
  standingsName: string;
  standingsValue: string;
  standingsAnon: string;
  standingsEmpty: string;
  standingsLoading: string;
  standingsFrozen: string;
  standingsLive: string;
  working: string;
  cancel: string;
  close: string;
  error: string;
};

type SeasonStatus = "upcoming" | "active" | "ended" | "closed";

function deriveStatus(r: SeasonRow, now: number): SeasonStatus {
  if (r.closedAt) return "closed";
  const start = new Date(r.startsAt).getTime();
  const end = new Date(r.endsAt).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
}

function statusPill(s: SeasonStatus): string {
  if (s === "active") return "pill-ok";
  if (s === "ended") return "pill-warn";
  return "pill-muted"; // upcoming + closed
}

function statusLabel(s: SeasonStatus, strings: SeasonStrings): string {
  switch (s) {
    case "upcoming":
      return strings.statusUpcoming;
    case "active":
      return strings.statusActive;
    case "ended":
      return strings.statusEnded;
    case "closed":
      return strings.statusClosed;
  }
}

function fdWithId(id: string): FormData {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

type ModalKind = "create" | "edit" | "close" | "reopen" | "delete" | "standings";
type ModalState = { kind: ModalKind; season?: SeasonRow } | null;

export function SeasonManager({
  seasons,
  locale,
  strings,
}: {
  seasons: SeasonRow[];
  locale: string;
  strings: SeasonStrings;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // "now" for status derivation — captured once on mount (statuses are coarse
  // enough that a per-render clock is unnecessary).
  const [now] = useState<number>(() => Date.now());

  // Auto-dismiss the transient success line.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const close = (successNotice?: string) => {
    setModal(null);
    if (successNotice) setNotice(successNotice);
  };

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

  const editing = modal?.kind === "edit" ? modal.season : undefined;
  const confirming =
    modal &&
    (modal.kind === "close" ||
      modal.kind === "reopen" ||
      modal.kind === "delete")
      ? modal
      : null;
  const standings =
    modal?.kind === "standings" ? modal.season : undefined;

  return (
    <div>
      <div
        className="row-actions"
        style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => setModal({ kind: "create" })}
        >
          {strings.new}
        </button>
        {notice && (
          <span className="inline-status ok" role="status">
            {notice}
          </span>
        )}
      </div>

      {seasons.length === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>
          {strings.empty}
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{strings.colName}</th>
                <th>{strings.colWindow}</th>
                <th>{strings.colStatus}</th>
                <th aria-label={strings.actions} />
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const status = deriveStatus(s, now);
                const isClosed = status === "closed";
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="nowrap">
                      {fmt(s.startsAt)} → {fmt(s.endsAt)}
                    </td>
                    <td className="nowrap">
                      <span className={`pill ${statusPill(status)}`}>
                        {statusLabel(status, strings)}
                      </span>
                    </td>
                    <td className="row-actions nowrap">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setModal({ kind: "standings", season: s })}
                      >
                        {strings.actionView}
                      </button>
                      {!isClosed && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setModal({ kind: "edit", season: s })}
                        >
                          {strings.actionEdit}
                        </button>
                      )}
                      {!isClosed && (
                        <button
                          type="button"
                          className="btn-warn btn-sm"
                          onClick={() => setModal({ kind: "close", season: s })}
                        >
                          {strings.actionClose}
                        </button>
                      )}
                      {isClosed && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setModal({ kind: "reopen", season: s })}
                        >
                          {strings.actionReopen}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-warn btn-sm"
                        onClick={() => setModal({ kind: "delete", season: s })}
                      >
                        {strings.actionDelete}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Create ---- */}
      <Modal
        isOpen={modal?.kind === "create"}
        onClose={() => setModal(null)}
        title={strings.newTitle}
        closeLabel={strings.close}
      >
        <SeasonForm
          mode="create"
          strings={strings}
          onSuccess={() => close(strings.created)}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* ---- Edit ---- */}
      <Modal
        isOpen={modal?.kind === "edit"}
        onClose={() => setModal(null)}
        title={strings.editTitle}
        closeLabel={strings.close}
      >
        {editing && (
          <SeasonForm
            key={editing.id}
            mode="edit"
            season={editing}
            strings={strings}
            onSuccess={() => close(strings.saved)}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* ---- Close / Reopen / Delete confirm ---- */}
      <Modal
        isOpen={Boolean(confirming)}
        onClose={() => setModal(null)}
        title={
          confirming?.kind === "close"
            ? strings.closeTitle
            : confirming?.kind === "reopen"
              ? strings.reopenTitle
              : strings.deleteTitle
        }
        closeLabel={strings.close}
      >
        {confirming?.season && (
          <ConfirmAction
            key={`${confirming.kind}:${confirming.season.id}`}
            season={confirming.season}
            kind={confirming.kind as "close" | "reopen" | "delete"}
            strings={strings}
            onSuccess={(msg) => close(msg)}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* ---- Standings ---- */}
      <Modal
        isOpen={modal?.kind === "standings"}
        onClose={() => setModal(null)}
        title={strings.standingsTitle}
        closeLabel={strings.close}
        wide
      >
        {standings && (
          <StandingsView
            key={standings.id}
            season={standings}
            status={deriveStatus(standings, now)}
            strings={strings}
          />
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit form (shared) — useActionState against createSeason/updateSeason.
// ---------------------------------------------------------------------------
function SeasonForm({
  mode,
  season,
  strings,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  season?: SeasonRow;
  strings: SeasonStrings;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const action = mode === "create" ? createSeason : updateSeason;
  const [state, formAction, pending] = useActionState<SeasonActionState, FormData>(
    action,
    null,
  );

  const [name, setName] = useState(season?.name ?? "");
  // Prefill datetime-local inputs from the stored ISO, rendered in the admin's
  // OWN browser timezone (so editing round-trips through the same tz as create).
  const [start, setStart] = useState(() => toLocalInput(season?.startsAt));
  const [end, setEnd] = useState(() => toLocalInput(season?.endsAt));

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  const endInvalid = Boolean(
    start && end && new Date(end).getTime() <= new Date(start).getTime(),
  );
  const canSubmit =
    Boolean(name.trim() && start && end) && !endInvalid && !pending;

  return (
    <form
      action={formAction}
      className="form"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {mode === "edit" && season && (
        <input type="hidden" name="id" value={season.id} />
      )}
      <input type="hidden" name="starts_at" value={toUtcIso(start)} />
      <input type="hidden" name="ends_at" value={toUtcIso(end)} />

      <label className="field">
        <span>{strings.name}</span>
        <input
          name="name"
          maxLength={120}
          required
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={strings.namePlaceholder}
        />
      </label>

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
      {state?.error && <p className="form-error">{state.error}</p>}

      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn" type="submit" disabled={!canSubmit}>
          {mode === "create"
            ? pending
              ? strings.creating
              : strings.create
            : pending
              ? strings.saving
              : strings.save}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {strings.cancel}
        </button>
      </div>
    </form>
  );
}

// ISO string → "YYYY-MM-DDTHH:mm" in the browser's local tz (for prefilling a
// datetime-local input). Empty/invalid → "".
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog for close / reopen / delete.
// ---------------------------------------------------------------------------
function ConfirmAction({
  season,
  kind,
  strings,
  onSuccess,
  onCancel,
}: {
  season: SeasonRow;
  kind: "close" | "reopen" | "delete";
  strings: SeasonStrings;
  onSuccess: (notice: string) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cfg = {
    close: {
      text: strings.closeText,
      confirm: strings.closeConfirm,
      done: strings.closeDone,
      run: closeSeason,
      danger: true,
    },
    reopen: {
      text: strings.reopenText,
      confirm: strings.reopenConfirm,
      done: strings.reopenDone,
      run: reopenSeason,
      danger: false,
    },
    delete: {
      text: strings.deleteText,
      confirm: strings.deleteConfirm,
      done: strings.deleteDone,
      run: deleteSeason,
      danger: true,
    },
  }[kind];

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await cfg.run(fdWithId(season.id));
      if (res?.error) setError(res.error);
      else onSuccess(cfg.done);
    });
  };

  return (
    <div className="form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        {cfg.text}
      </p>
      <p style={{ margin: 0, fontWeight: 600 }}>{season.name}</p>
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className={cfg.danger ? "btn-warn" : "btn"}
          onClick={submit}
          disabled={pending}
        >
          {pending ? strings.working : cfg.confirm}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {strings.cancel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standings modal — loads live/frozen standings for the selected season.
// ---------------------------------------------------------------------------
function StandingsView({
  season,
  status,
  strings,
}: {
  season: SeasonRow;
  status: SeasonStatus;
  strings: SeasonStrings;
}) {
  const [rows, setRows] = useState<SeasonStandingRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchSeasonStandings(season.id)
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [season.id]);

  return (
    <div>
      <p style={{ marginTop: 0, fontWeight: 600 }}>{season.name}</p>
      <p className="muted" style={{ marginTop: 0 }}>
        {status === "closed" ? strings.standingsFrozen : strings.standingsLive}
      </p>
      {rows === null ? (
        <p className="muted">{strings.standingsLoading}</p>
      ) : rows.length === 0 ? (
        <p className="muted">{strings.standingsEmpty}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>{strings.standingsRank}</th>
                <th>{strings.standingsName}</th>
                <th className="nowrap">{strings.standingsValue}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank}>
                  <td className="nowrap">{r.rank}</td>
                  <td>
                    {r.displayName ? (
                      r.displayName
                    ) : (
                      <span className="pill pill-muted">
                        {strings.standingsAnon}
                      </span>
                    )}
                  </td>
                  <td className="nowrap">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
