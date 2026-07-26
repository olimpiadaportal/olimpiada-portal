"use client";

// Public marketing-site top nav (owner bug: "when we choose any button in
// navigation that button in landing page is not highlighted").
//
// The public layout is a SERVER component and cannot read the pathname, so the
// link row is extracted into this small client island — nothing else moved out
// of the layout. Labels arrive pre-translated from the server (no i18n here).
//
// Active detection mirrors the parent/student shells (ParentNavLinks /
// ChildNavLinks): prefix matching so nested routes keep their section marked
// (`/news/<slug>` → News, `/olympiad-packages/<code>` → the olympiad item when
// one exists), while "/" is exact-matched so the home entry is not lit on
// every page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Segmented } from "@/components/Segmented";

export type PublicNavItem = { href: string; label: string };

export function PublicNavLinks({ items }: { items: PublicNavItem[] }) {
  const pathname = usePathname() ?? "/";
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Segmented as="nav" className="site-links" variant="underline">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`site-link${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </Segmented>
  );
}
