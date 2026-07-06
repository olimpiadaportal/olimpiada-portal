import "server-only";

// Shared sanitizer for user-supplied search terms that end up inside PostgREST
// filter expressions (.ilike / .or(...ilike...)). Single source of truth so
// every list page applies the SAME rules (audit finding M18 — the previous
// inline copies had drifted apart):
//   1) trim + cap at 200 chars,
//   2) strip characters PostgREST's or()/filter grammar treats specially
//      (comma, parentheses, quotes) so raw input can never alter the filter,
//   3) escape LIKE wildcards (\ % _) so the term is matched literally.
// Returns the escaped term ready for `%${term}%` interpolation — may be ""
// (callers should skip the filter when empty).
export function sanitizeSearchTerm(raw: string): string {
  const trimmed = String(raw ?? "").trim().slice(0, 200);
  const stripped = trimmed.replace(/[,()"']/g, " ").trim();
  return stripped.replace(/[\\%_]/g, (m) => `\\${m}`);
}
