"use client";

// Student "Planned olympiads" card + detail modal.
// R9 (T5) fix: the detail dialog used to render INSIDE the rounded card, where
// the card's overflow/stacking clipped and mispositioned it (the "Ətraflı is
// buggy" report). It now uses the shared <Modal/> which portals into <body> —
// overlay click, Escape, ×, scroll lock and focus handling all come from the
// shared component. Strings still arrive translated from the server.
import { useState } from "react";
import { Modal } from "@/components/Modal";

export type PlannedOlympiad = {
  id: string;
  title: string;
  desc: string;
  coverUrl: string | null;
  dateText: string;
  statusKind: "upcoming" | "planned" | "held";
  statusText: string;
  subject: string | null;
  typeName: string | null;
  questionsText: string;
  priceText: string;
};

export type PlannedDict = {
  details: string;
  buyNote: string;
  close: string;
  subject: string;
  type: string;
  date: string;
  qcount: string;
  price: string;
};

// Inline-SVG medal for the branded gradient placeholder (no external images —
// strict CSP).
function MedalIcon({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M17 4h7l-5.5 15h-9L17 4Z" fill="rgba(255,255,255,0.9)" />
      <path d="M31 4h-7l5.5 15h9L31 4Z" fill="rgba(255,255,255,0.55)" />
      <circle cx="24" cy="31" r="12" fill="#ffffff" />
      <circle cx="24" cy="31" r="8.6" fill="none" stroke="#7c3aed" strokeWidth="2" />
      <path
        d="M24 26.2l1.7 3.4 3.7.5-2.7 2.6.7 3.7-3.4-1.8-3.4 1.8.7-3.7-2.7-2.6 3.7-.5 1.7-3.4Z"
        fill="#ff8a00"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  );
}

export function OlympiadPlannedCard({
  item,
  dict,
}: {
  item: PlannedOlympiad;
  dict: PlannedDict;
}) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string }[] = [];
  if (item.subject) rows.push({ label: dict.subject, value: item.subject });
  if (item.typeName) rows.push({ label: dict.type, value: item.typeName });
  rows.push({ label: dict.date, value: item.dateText });
  rows.push({ label: dict.qcount, value: item.questionsText });
  rows.push({ label: dict.price, value: item.priceText });

  return (
    <article className="oly4-card">
      {item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="oly4-cover" src={item.coverUrl} alt="" loading="lazy" />
      ) : (
        <div className="oly4-cover oly4-cover-ph" aria-hidden="true">
          <MedalIcon />
        </div>
      )}
      <div className="oly4-body">
        <div className="oly4-chips">
          {item.subject && <span className="oly4-chip">{item.subject}</span>}
          <span className={`oly4-chip oly4-status is-${item.statusKind}`}>
            {item.statusText}
          </span>
        </div>
        <h3 className="oly4-title">{item.title}</h3>
        <p className="oly4-desc">{item.desc}</p>
        <p className="oly4-meta">
          <CalendarIcon />
          <span>{item.dateText}</span>
        </p>
        <div className="oly4-foot">
          <span className="oly4-count">{item.questionsText}</span>
          <button type="button" className="oly4-btn" onClick={() => setOpen(true)}>
            {dict.details}
          </button>
        </div>
      </div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={item.title}
        closeLabel={dict.close}
      >
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="oly4-modal-cover" src={item.coverUrl} alt="" />
        ) : (
          <div className="oly4-modal-cover oly4-cover-ph" aria-hidden="true">
            <MedalIcon size={40} />
          </div>
        )}
        <div className="oly4-chips" style={{ marginTop: 12 }}>
          <span className={`oly4-chip oly4-status is-${item.statusKind}`}>
            {item.statusText}
          </span>
        </div>
        {item.desc && <p className="oly4-desc">{item.desc}</p>}
        <dl className="oly4-rows">
          {rows.map((r) => (
            <div className="oly4-row" key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {/* M12: an already-held event is archived — no "ask your parent to
            buy" hint for it (purchasers keep their access as before). */}
        {item.statusKind !== "held" && (
          <p className="oly4-note">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            <span>{dict.buyNote}</span>
          </p>
        )}
      </Modal>
    </article>
  );
}
