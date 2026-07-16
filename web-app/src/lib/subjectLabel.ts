// ONE reusable, locale-aware subject label resolver.
//
// The `subjects` catalog stores the Azerbaijani display name in `name`
// ("Riyaziyyat") plus a canonical machine `code` ("math"). Rendering `name`
// directly showed Azerbaijani in every locale; every surface that shows a
// subject now resolves the label through this helper instead.
//
// Resolution: `subj.<code>` from the i18n catalog (az/en/ru dictionary keys,
// override-aware because callers pass their t()) → raw DB `name` for unknown
// codes → the code itself → "—". Stored/submitted values stay the subject
// UUID everywhere; this only changes the visible label.
//
// Pure/iso (no server deps) so both server components (with getT()) and
// client components (with useT()/dict-based t) can share it. Both t()
// implementations return the KEY STRING itself for unknown keys — that is
// detected and treated as "no translation".

/**
 * Locale-aware subject label: az "Riyaziyyat", en "Mathematics",
 * ru "Математика". Unknown/missing code falls back to the raw DB subject
 * name — never to a raw i18n key.
 */
export function subjectLabel(
  t: (key: string) => string,
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  const fallback = (name ?? "").trim() || (code ?? "").trim() || "—";
  const c = (code ?? "").trim();
  if (!c) return fallback;
  const key = `subj.${c}`;
  const v = t(key);
  return v === key ? fallback : v;
}
