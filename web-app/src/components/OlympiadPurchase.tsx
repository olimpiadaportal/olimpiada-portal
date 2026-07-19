"use client";

// Round 9 (T7) — parent "Olimpiadalar" catalog: child selector + package cards
// + purchase confirmation through the shared <Modal/> (portal, overlay/Escape/×,
// scroll lock, focus handling). All strings arrive translated via `dict` so this
// component never touches messages.ts and never renders a raw key.
//
// Flow: pick a child (segmented buttons) → each card shows OWNED pill or a
// "Buy for <child>" button → button opens the modal (package / child / price +
// mock-payment note) → Confirm runs purchaseOlympiadForChild (useActionState)
// → success (or "already owned" after a race) INSIDE the modal; the card flips
// to owned without a full reload (local state + router.refresh()).
import { useCallback, useEffect, useMemo, useRef, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import {
  purchaseOlympiadForChild,
  type PurchaseOlympiadState,
} from "@/lib/auth/olympiadService";

export type PolyChild = { id: string; name: string };

export type PolyPackage = {
  id: string;
  title: string;
  desc: string;
  coverUrl: string | null;
  subject: string | null;
  typeName: string | null;
  /** Localized event date, or null when the event date is not set. */
  dateText: string | null;
  questionsText: string;
  priceText: string;
  /** student profile ids that already own this package (status active). */
  ownedBy: string[];
  /** M12: event date already passed → archived for purchase (no buy CTA). */
  past: boolean;
  /** Sale window closed/not open (server-evaluated) → chip instead of Buy. */
  offSale: boolean;
};

export type PolyDict = {
  chooseChild: string;
  noChildren: string;
  addChild: string;
  none: string;
  owned: string;
  /** Plain "Buy" — the child comes from the selector above the grid. */
  buy: string;
  price: string;
  modalTitle: string;
  modalPackage: string;
  modalChild: string;
  modalMockNote: string;
  modalConfirm: string;
  modalCancel: string;
  modalClose: string;
  modalPending: string;
  modalSuccess: string;
  modalAlready: string;
  /** M12: label shown on past-event (archived) packages instead of a buy CTA. */
  pastLabel: string;
  /** Sale window closed — shown instead of a buy CTA (purchase_olympiad
      rejects off-sale buys server-side either way). */
  notOnSaleLabel: string;
};

// Inline-SVG medal for the branded gradient placeholder (no external images —
// strict CSP; mirrors the student-side card placeholder).
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

// Confirmation + result body, remounted (via key) for every purchase attempt so
// useActionState starts from a clean slate each time the modal opens.
function PurchaseDialogBody({
  pkg,
  child,
  dict,
  onDone,
  onClose,
}: {
  pkg: PolyPackage;
  child: PolyChild;
  dict: PolyDict;
  onDone: (childId: string, packageId: string) => void;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<PurchaseOlympiadState, FormData>(
    purchaseOlympiadForChild,
    null,
  );

  // On success (including the "already owned" race) flip the card to owned —
  // exactly once per mounted attempt (the ref guards against effect re-runs).
  const doneFired = useRef(false);
  useEffect(() => {
    if (state?.ok && !doneFired.current) {
      doneFired.current = true;
      onDone(child.id, pkg.id);
    }
  }, [state, child.id, pkg.id, onDone]);

  if (state?.ok) {
    return (
      <div className="poly-success" role="status">
        <span className="poly-success-icon" aria-hidden="true">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p className="poly-success-text">
          {state.already ? dict.modalAlready : dict.modalSuccess}
        </p>
        <div className="poly-actions">
          <button type="button" className="btn" onClick={onClose}>
            {dict.modalClose}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="student_id" value={child.id} />
      <input type="hidden" name="package_id" value={pkg.id} />

      <dl className="poly-rows">
        <div className="poly-row">
          <dt>{dict.modalPackage}</dt>
          <dd>{pkg.title}</dd>
        </div>
        <div className="poly-row">
          <dt>{dict.modalChild}</dt>
          <dd>{child.name}</dd>
        </div>
        <div className="poly-row">
          <dt>{dict.price}</dt>
          <dd className="poly-row-price">{pkg.priceText}</dd>
        </div>
      </dl>

      <p className="poly-note">
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
        <span>{dict.modalMockNote}</span>
      </p>

      {state && !state.ok && <p className="poly-error">{state.error}</p>}

      <div className="poly-actions">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
          {dict.modalCancel}
        </button>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? dict.modalPending : dict.modalConfirm}
        </button>
      </div>
    </form>
  );
}

export function OlympiadPurchase({
  childrenList,
  packages,
  canBuy,
  dict,
}: {
  childrenList: PolyChild[];
  packages: PolyPackage[];
  /** payments availability (server-evaluated) — hides buy buttons when off. */
  canBuy: boolean;
  dict: PolyDict;
}) {
  const router = useRouter();
  const [childId, setChildId] = useState<string>(childrenList[0]?.id ?? "");
  const [buying, setBuying] = useState<PolyPackage | null>(null);
  // (childId:packageId) purchased in this session — flips cards to "owned"
  // instantly; router.refresh() then re-syncs the server-rendered props.
  const [justOwned, setJustOwned] = useState<ReadonlySet<string>>(new Set());
  // Bumped every time the modal opens so the dialog body (and its
  // useActionState) remounts fresh for each purchase attempt.
  const [attempt, setAttempt] = useState(0);

  const child = useMemo(
    () => childrenList.find((c) => c.id === childId) ?? null,
    [childrenList, childId],
  );

  // Stable identity (it sits in the dialog effect's deps) and a same-reference
  // bail-out when the key is already present, so a repeat call can never start
  // a render loop. Declared before the early return (rules of hooks).
  const onDone = useCallback(
    (cid: string, pid: string) => {
      const key = `${cid}:${pid}`;
      setJustOwned((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      router.refresh();
    },
    [router],
  );

  if (childrenList.length === 0) {
    return (
      <div className="poly-empty">
        <p className="muted">{dict.noChildren}</p>
        <Link className="btn" href="/children/new">
          {dict.addChild}
        </Link>
      </div>
    );
  }

  const isOwned = (pkg: PolyPackage): boolean =>
    pkg.ownedBy.includes(childId) || justOwned.has(`${childId}:${pkg.id}`);

  const openBuy = (pkg: PolyPackage) => {
    setAttempt((n) => n + 1);
    setBuying(pkg);
  };

  return (
    <>
      {/* Child selector */}
      <div className="poly-picker">
        <span className="field-label">{dict.chooseChild}</span>
        <div className="poly-seg" role="group" aria-label={dict.chooseChild}>
          {childrenList.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`poly-seg-btn${c.id === childId ? " active" : ""}`}
              aria-pressed={c.id === childId}
              onClick={() => setChildId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {packages.length === 0 ? (
        <p className="muted">{dict.none}</p>
      ) : (
        <div className="poly-grid">
          {packages.map((pkg) => {
            const owned = isOwned(pkg);
            return (
              <article className="poly-card" key={pkg.id}>
                {pkg.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="poly-cover" src={pkg.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div className="poly-cover poly-cover-ph" aria-hidden="true">
                    <MedalIcon />
                  </div>
                )}
                <div className="poly-body">
                  {(pkg.subject || pkg.typeName) && (
                    <div className="poly-chips">
                      {pkg.subject && <span className="poly-chip">{pkg.subject}</span>}
                      {pkg.typeName && <span className="poly-chip">{pkg.typeName}</span>}
                    </div>
                  )}
                  <h3 className="poly-title">{pkg.title}</h3>
                  {pkg.desc && <p className="poly-desc">{pkg.desc}</p>}
                  <div className="poly-meta">
                    {pkg.dateText && (
                      <span className="poly-meta-item">
                        <CalendarIcon />
                        {pkg.dateText}
                      </span>
                    )}
                    <span className="poly-meta-item">{pkg.questionsText}</span>
                  </div>
                  <div className="poly-foot">
                    <span className="poly-price">{pkg.priceText}</span>
                    {owned ? (
                      <span className="poly-owned">{dict.owned}</span>
                    ) : pkg.past ? (
                      // M12: the event was already held — archived; never buyable.
                      <span className="poly-chip">{dict.pastLabel}</span>
                    ) : pkg.offSale ? (
                      // Sale window closed for this (family-visible) package —
                      // the server rejects such buys with poly.err.notOnSale.
                      <span className="poly-chip">{dict.notOnSaleLabel}</span>
                    ) : canBuy && child ? (
                      <button
                        type="button"
                        className="poly-buy"
                        onClick={() => openBuy(pkg)}
                      >
                        {dict.buy}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={buying !== null}
        onClose={() => setBuying(null)}
        title={dict.modalTitle}
        closeLabel={dict.modalClose}
      >
        {buying && child && (
          <PurchaseDialogBody
            key={`${childId}:${buying.id}:${attempt}`}
            pkg={buying}
            child={child}
            dict={dict}
            onDone={onDone}
            onClose={() => setBuying(null)}
          />
        )}
      </Modal>
    </>
  );
}
