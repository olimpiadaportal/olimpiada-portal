"use client";

// Round 9 (T7) — parent "Olimpiadalar" catalog: child selector + package cards
// + purchase confirmation through the shared <Modal/> (portal, overlay/Escape/×,
// scroll lock, focus handling). All strings arrive translated via `dict` so this
// component never touches messages.ts and never renders a raw key.
//
// Flow: pick a child (segmented buttons) — Round 40: the selection FILTERS the
// grid to that child's packages (grade match / owned / legacy grade-less) and
// scopes each card's question count — each card shows OWNED pill or a
// "Buy for <child>" button → button opens the modal (package / child / price +
// mock-payment note) → Confirm runs purchaseOlympiadForChild (useActionState)
// → success (or "already owned" after a race) INSIDE the modal; the card flips
// to owned without a full reload (local state + router.refresh()).
import { useCallback, useEffect, useMemo, useRef, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { OlympiadCover } from "@/components/OlympiadCover";
import {
  OlympiadDetailsRows,
  type OlympiadDetailRow,
} from "@/components/OlympiadDetails";
import {
  purchaseOlympiadForChild,
  type PurchaseOlympiadState,
} from "@/lib/auth/olympiadService";

export type PolyChild = {
  id: string;
  name: string;
  /** students.grade_id — drives which packages this child sees. */
  gradeId: string | null;
};

export type PolyPackage = {
  id: string;
  title: string;
  desc: string;
  coverUrl: string | null;
  subject: string | null;
  typeName: string | null;
  /** Localized event date, or null when the event date is not set. */
  dateText: string | null;
  /** Grade ids this package targets; null = legacy grade-less (every child). */
  gradeIds: string[] | null;
  /** Localized grade/grades label (null = legacy grade-less → row hidden). */
  gradeLabel: string | null;
  /** Published pool count per family-matching grade id. */
  countByGrade: Record<string, number>;
  /** Whole-pool count — used when the selected grade has no entry (legacy). */
  fallbackCount: number;
  /** Attempt time limit in minutes (null = not set → row hidden). */
  durationMinutes: number | null;
  /** Localized sale-window start / end (null = not set → row hidden). */
  saleStartText: string | null;
  saleEndText: string | null;
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
  /** Suffix word after the pool count ("25 questions"). */
  questions: string;
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
  /** "Ətraflı" button + details-modal row labels (Round 43). */
  details: string;
  detType: string;
  detSubject: string;
  detGrade: string;
  detGrades: string;
  detQuestions: string;
  detDuration: string;
  detEventAt: string;
  detSaleStart: string;
  detSaleEnd: string;
  detPrice: string;
  detDescription: string;
  detMinutes: string;
};

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

// Animated olympiad-type marquee (Round 43): the type sits in a fixed-width,
// overflow-hidden, nowrap strip at the TOP of the card. It scrolls right-to-left
// (seamless two-segment loop) ONLY when the text is wider than the strip —
// short text stays static. The CSS animates strictly under
// prefers-reduced-motion: no-preference and pauses on hover; the duplicate
// segment sits off-screen when idle, so no animation never shows two copies.
function TypeMarquee({ text }: { text: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current;
      // The wrap is overflow-hidden + nowrap, so scrollWidth is the full text
      // width and clientWidth is the visible strip — animate only when wider.
      if (w) setOverflow(w.scrollWidth > w.clientWidth + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // Re-measure only when the (single, stable) label changes; once a strip is
    // known to overflow it stays overflowing at any width the card can take.
  }, [text]);

  return (
    <div className="poly-type" ref={wrapRef} title={text}>
      {overflow ? (
        <span className="poly-type-track">
          <span className="poly-type-seg">{text}</span>
          <span className="poly-type-seg" aria-hidden="true">
            {text}
          </span>
        </span>
      ) : (
        <span className="poly-type-static">{text}</span>
      )}
    </div>
  );
}

// Read-only "Ətraflı" body — every AVAILABLE field with an az label. The rows
// themselves render through the SHARED <OlympiadDetailsRows/> (also used by the
// public details page), which drops any row whose value is null/empty so the UI
// never renders "null"/"undefined".
function DetailsDialogBody({
  pkg,
  count,
  dict,
  onClose,
}: {
  pkg: PolyPackage;
  count: number;
  dict: PolyDict;
  onClose: () => void;
}) {
  const multiGrade = (pkg.gradeIds?.length ?? 0) > 1;
  const rows: OlympiadDetailRow[] = [
    { label: dict.detType, value: pkg.typeName },
    { label: dict.detSubject, value: pkg.subject },
    { label: multiGrade ? dict.detGrades : dict.detGrade, value: pkg.gradeLabel },
    { label: dict.detQuestions, value: count > 0 ? String(count) : null },
    {
      label: dict.detDuration,
      value: pkg.durationMinutes ? `${pkg.durationMinutes} ${dict.detMinutes}` : null,
    },
    { label: dict.detEventAt, value: pkg.dateText },
    { label: dict.detSaleStart, value: pkg.saleStartText },
    { label: dict.detSaleEnd, value: pkg.saleEndText },
    { label: dict.detPrice, value: pkg.priceText },
  ];

  return (
    <>
      <OlympiadDetailsRows
        rows={rows}
        description={pkg.desc}
        descriptionLabel={dict.detDescription}
      />
      <div className="poly-actions">
        <button type="button" className="btn" onClick={onClose}>
          {dict.modalClose}
        </button>
      </div>
    </>
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
  // Round 43: the "Ətraflı" details modal — independent of the purchase flow
  // (viewing details never requires a purchase).
  const [details, setDetails] = useState<PolyPackage | null>(null);
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

  // Round 40: the selected child is the single source of truth for the grid —
  // a package shows iff it is legacy grade-less, already owned by THIS child
  // (lifetime access), or targets this child's grade. Pure client narrowing of
  // the server-shipped family superset, so switching children is instant.
  const visiblePackages = useMemo(() => {
    if (!child) return packages;
    return packages.filter(
      (pkg) =>
        pkg.gradeIds === null ||
        pkg.ownedBy.includes(child.id) ||
        (child.gradeId !== null && pkg.gradeIds.includes(child.gradeId)),
    );
  }, [packages, child]);

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

  // The pool count the SELECTED child would receive (their grade's pool, else
  // the whole-pool fallback) — shared by the card meta and the details modal.
  const countFor = (pkg: PolyPackage): number =>
    (child?.gradeId != null ? pkg.countByGrade[child.gradeId] : undefined) ??
    pkg.fallbackCount;

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

      {visiblePackages.length === 0 ? (
        <p className="muted">{dict.none}</p>
      ) : (
        <div className="poly-grid">
          {visiblePackages.map((pkg) => {
            const owned = isOwned(pkg);
            // The count the SELECTED child would receive: their grade's pool,
            // falling back to the whole-pool count (legacy grade-less rows).
            const questionCount = countFor(pkg);
            return (
              <article className="poly-card" key={pkg.id}>
                <OlympiadCover url={pkg.coverUrl} />
                <div className="poly-body">
                  {/* Round 43: the olympiad type headlines the card as an
                      overflow-aware marquee. */}
                  {pkg.typeName && <TypeMarquee text={pkg.typeName} />}
                  {pkg.subject && (
                    <div className="poly-chips">
                      <span className="poly-chip">{pkg.subject}</span>
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
                    <span className="poly-meta-item">
                      {questionCount} {dict.questions}
                    </span>
                  </div>
                  <div className="poly-foot">
                    <span className="poly-price">{pkg.priceText}</span>
                    <div className="poly-foot-actions">
                      {/* Ətraflı is available on EVERY card — details never
                          require a purchase. */}
                      <button
                        type="button"
                        className="poly-details-btn"
                        onClick={() => setDetails(pkg)}
                      >
                        {dict.details}
                      </button>
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

      {/* Read-only "Ətraflı" details — open for any card, no purchase needed. */}
      <Modal
        isOpen={details !== null}
        onClose={() => setDetails(null)}
        title={details?.title}
        closeLabel={dict.modalClose}
      >
        {details && (
          <DetailsDialogBody
            pkg={details}
            count={countFor(details)}
            dict={dict}
            onClose={() => setDetails(null)}
          />
        )}
      </Modal>
    </>
  );
}
