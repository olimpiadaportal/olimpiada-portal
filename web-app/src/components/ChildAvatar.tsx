// Shared child-avatar renderer — a small PRESENTATIONAL component usable from
// server AND client components. The caller resolves the display URL first
// (lib/childAvatar.resolveChildAvatarUrl: photo → short-lived signed URL,
// preset → bundled PNG); null falls back to the existing initials bubble.
// Leaderboards deliberately never use this with photos (initials only).

export function ChildAvatar({
  url,
  name,
  size = 44,
  className,
}: {
  /** Resolved display URL (signed photo URL or preset PNG) — null = initials. */
  url: string | null;
  /** The child's display name (first initial feeds the bubble fallback). */
  name: string;
  size?: number;
  className?: string;
}) {
  const cls = className ? ` ${className}` : "";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`child-ava-img${cls}`}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
      />
    );
  }
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className={`child-ava-mark${cls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
