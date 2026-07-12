"use client";

// Student-arena top nav (owner fix, 2026-07). Exams AND olympiads share the
// /child/test/run|result|review routes, so pathname-prefix matching alone
// wrongly highlighted the Exams tab during an olympiad attempt. This module
// adds a kind-aware ACTIVE-TAB OVERRIDE on top of the ParentNavLinks pattern:
//
//   <ChildNavProvider>            — context holder, wraps the arena shell;
//   <ChildNavLinks items={...}/>  — same markup/contract as ParentNavLinks
//                                   (.pnav-links/.pnav-link/.pnav-brand), but
//                                   an override, when set, wins over pathname;
//   <ChildNavActive href="..."/>  — rendered BY the attempt pages (which know
//                                   test_attempts.kind server-side) to point
//                                   the highlight at /child/olympiads for
//                                   kind='olympiad' and /child/test otherwise.
//
// The href travels as a server-rendered prop (survives refresh — not derived
// client-side), and the override applies in a pre-paint layout effect, so
// client-side navigations never flash the wrong tab. Only on a hard refresh
// does the first server-painted frame fall back to pathname matching until
// hydration (a layout cannot read a deeper segment's attempt kind).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

// Avoid React's "useLayoutEffect does nothing on the server" SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ChildNavCtx = createContext<{
  override: string | null;
  setOverride: (href: string | null) => void;
}>({ override: null, setOverride: () => {} });

export function ChildNavProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  return (
    <ChildNavCtx.Provider value={{ override, setOverride }}>
      {children}
    </ChildNavCtx.Provider>
  );
}

/**
 * Rendered by pages that know the attempt kind server-side (run/result/review):
 * pins the nav highlight to `href` while mounted, releases it on unmount.
 * Renders nothing.
 */
export function ChildNavActive({ href }: { href: string }) {
  const { setOverride } = useContext(ChildNavCtx);
  useIsoLayoutEffect(() => {
    setOverride(href);
    return () => setOverride(null);
  }, [href, setOverride]);
  return null;
}

/**
 * Student top-nav links. Identical rendering contract to ParentNavLinks; the
 * active link is the override when one is pinned, otherwise the pathname match
 * (`exact` opts out of prefix matching — the "/child" home tab).
 */
export function ChildNavLinks({
  items,
}: {
  items: { href: string; label: string; brand?: boolean; exact?: boolean }[];
}) {
  const pathname = usePathname();
  const { override } = useContext(ChildNavCtx);
  const isActive = (it: { href: string; exact?: boolean }) => {
    if (override) return it.href === override;
    return it.exact
      ? pathname === it.href
      : pathname === it.href || pathname.startsWith(`${it.href}/`);
  };
  return (
    <nav className="pnav-links">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`pnav-link${isActive(it) ? " active" : ""}`}
          aria-current={isActive(it) ? "page" : undefined}
        >
          {it.brand ? (
            <>
              <span className="pnav-brand" aria-hidden="true" />
              {it.label}
            </>
          ) : (
            it.label
          )}
        </Link>
      ))}
    </nav>
  );
}
