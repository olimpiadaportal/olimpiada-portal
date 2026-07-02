import type { ReactNode } from "react";

// Presentational settings card (Settings redesign, Round 6).
// Plain component (no "use client") so it renders inside the server tree:
// a rounded card with a bold title + one-line gray description header, plus
// optional warning (amber accent) and info (blue accent) variants.
export function SettingCard({
  title,
  description,
  variant = "default",
  children,
}: {
  title: string;
  description: string;
  variant?: "default" | "warning" | "info";
  children: ReactNode;
}) {
  const variantClass =
    variant === "warning"
      ? " setting-card-warn"
      : variant === "info"
        ? " setting-card-info"
        : "";
  return (
    <section className={`card setting-card${variantClass}`}>
      <div className="setting-card-head">
        <h3>{title}</h3>
        <p className="setting-card-desc">{description}</p>
      </div>
      <div className="setting-card-body">{children}</div>
    </section>
  );
}
