"use client";

// Broadcast history (Admin-only). Read-only list of admin_notifications rows with
// a status pill, delivered/total progress and a detail modal (shared Modal).
import { useState } from "react";
import { Modal } from "@/components/Modal";

export type HistoryRow = {
  id: string;
  title: string;
  body: string;
  audienceType: string;
  channels: string[];
  status: string;
  totalRecipients: number;
  deliveredCount: number;
  failedCount: number;
  templateCode: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  // For olympiad_buyers sends: the selected package names (title snapshot
  // stored in audience_filter.package_titles; ids as a fallback).
  packageTitles?: string[];
};

export type HistoryStrings = {
  heading: string;
  colTitle: string;
  colAudience: string;
  colChannels: string;
  colStatus: string;
  colProgress: string;
  colWhen: string;
  none: string;
  view: string;
  detailTitle: string;
  bodyLabel: string;
  templateLabel: string;
  packagesLabel: string;
  scheduledAtLabel: string;
  sentAtLabel: string;
  createdAtLabel: string;
  close: string;
  // audience labels keyed by audience_type
  audience: Record<string, string>;
  // status labels keyed by status
  status: Record<string, string>;
};

function statusPill(s: string): string {
  if (s === "sent") return "pill-ok";
  if (s === "failed") return "pill-warn";
  return "pill-muted"; // draft / scheduled / sending / canceled
}

export function NotificationHistory({
  rows,
  locale,
  strings,
}: {
  rows: HistoryRow[];
  locale: string;
  strings: HistoryStrings;
}) {
  const [detail, setDetail] = useState<HistoryRow | null>(null);

  const fmt = (iso: string | null): string => {
    if (!iso) return "—";
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

  const audienceLabel = (a: string): string => strings.audience[a] ?? a;
  const statusLabel = (s: string): string => strings.status[s] ?? s;

  return (
    <div>
      {rows.length === 0 ? (
        <p className="muted">{strings.none}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{strings.colTitle}</th>
                <th>{strings.colAudience}</th>
                <th>{strings.colChannels}</th>
                <th>{strings.colStatus}</th>
                <th>{strings.colProgress}</th>
                <th>{strings.colWhen}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td className="nowrap">{audienceLabel(r.audienceType)}</td>
                  <td className="nowrap">{r.channels.join(", ")}</td>
                  <td className="nowrap">
                    <span className={`pill ${statusPill(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="nowrap">
                    {r.deliveredCount}/{r.totalRecipients}
                    {r.failedCount > 0 ? ` (−${r.failedCount})` : ""}
                  </td>
                  <td className="nowrap muted">
                    {fmt(r.status === "scheduled" ? r.scheduledAt : r.sentAt ?? r.createdAt)}
                  </td>
                  <td className="row-actions nowrap">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setDetail(r)}
                    >
                      {strings.view}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={strings.detailTitle}
        closeLabel={strings.close}
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{detail.title}</div>
            <div>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {strings.bodyLabel}
              </span>
              <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                {detail.body}
              </p>
            </div>
            <div className="row-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="pill pill-muted">
                {audienceLabel(detail.audienceType)}
              </span>
              <span className={`pill ${statusPill(detail.status)}`}>
                {statusLabel(detail.status)}
              </span>
              {detail.channels.map((c) => (
                <span key={c} className="pill pill-muted">
                  {c}
                </span>
              ))}
            </div>
            {/* olympiad_buyers: the packages this send targeted (title snapshot). */}
            {detail.packageTitles && detail.packageTitles.length > 0 && (
              <div>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {strings.packagesLabel}
                </span>
                <div
                  className="row-actions"
                  style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}
                >
                  {detail.packageTitles.map((p, i) => (
                    <span key={i} className="pill pill-muted">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <dl className="detail-grid" style={{ margin: 0 }}>
              <MetaRow
                label={strings.colProgress}
                value={`${detail.deliveredCount}/${detail.totalRecipients}${
                  detail.failedCount > 0 ? ` (−${detail.failedCount})` : ""
                }`}
              />
              {detail.templateCode && (
                <MetaRow label={strings.templateLabel} value={detail.templateCode} />
              )}
              {detail.scheduledAt && (
                <MetaRow
                  label={strings.scheduledAtLabel}
                  value={fmt(detail.scheduledAt)}
                />
              )}
              {detail.sentAt && (
                <MetaRow label={strings.sentAtLabel} value={fmt(detail.sentAt)} />
              )}
              <MetaRow
                label={strings.createdAtLabel}
                value={fmt(detail.createdAt)}
              />
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "4px 0",
        borderTop: "1px solid var(--border, rgba(0,0,0,0.08))",
      }}
    >
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}
