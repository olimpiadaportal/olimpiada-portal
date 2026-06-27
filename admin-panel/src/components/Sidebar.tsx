"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string | null; soon: boolean };
type Group = { label: string; items: Item[] };

export function Sidebar({
  groups,
  soonLabel,
}: {
  groups: Group[];
  soonLabel: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Admin sections">
      {groups.map((g) => (
        <div className="nav-group" key={g.label}>
          <span className="nav-section-label">{g.label}</span>
          {g.items.map((it) =>
            it.href && !it.soon ? (
              <Link
                key={it.label}
                href={it.href}
                className={`nav-item${
                  pathname === it.href || pathname.startsWith(it.href + "/")
                    ? " active"
                    : ""
                }`}
              >
                {it.label}
              </Link>
            ) : (
              <span
                key={it.label}
                className="nav-item disabled"
                aria-disabled="true"
              >
                {it.label}
                {it.soon && <span className="badge-soon">{soonLabel}</span>}
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
