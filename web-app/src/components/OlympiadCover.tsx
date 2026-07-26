// Shared olympiad cover renderer — ONE implementation for the parent catalog
// cards (client component) and the public listing/details pages (server
// components). It holds no hooks and no server-only imports, so it renders in
// both environments; extracting it stopped the branded placeholder from being
// re-implemented per surface.
//
// The placeholder is an inline SVG on purpose: the strict CSP forbids external
// images, and a data-URI/remote fallback would be a second asset to keep in
// sync with the .poly-cover-ph gradient.

/** Branded gradient-placeholder medal (also reused as a page-level glyph). */
export function MedalIcon({ size = 46 }: { size?: number }) {
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

/**
 * Cover image for an olympiad package, or the branded gradient placeholder
 * when the package has none. `className` is appended to `.poly-cover` so a
 * surface can grow the aspect ratio (the details page uses `.polydet-cover`).
 */
export function OlympiadCover({
  url,
  className,
  iconSize,
}: {
  url: string | null;
  className?: string;
  iconSize?: number;
}) {
  const cls = className ? `poly-cover ${className}` : "poly-cover";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={url} alt="" loading="lazy" />;
  }
  return (
    <div className={`${cls} poly-cover-ph`} aria-hidden="true">
      <MedalIcon size={iconSize} />
    </div>
  );
}
