// Shared lock glyph. Extracted from AnalyticsDashboard, where it was
// module-local and unexported, when the Free Trial picker needed the same mark
// for a capped subject card — one padlock in this codebase, not two that drift.
//
// Inline SVG on purpose: the CSP forbids external images, and `currentColor`
// lets each caller inherit its own muted/accent tone without a per-theme rule.
export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
