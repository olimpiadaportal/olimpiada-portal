"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Round 10 — generic reusable list filter bar (news / olympiad / manage /
// cities / schools / accounts). Follows the QuestionFilters conventions:
// the URL is the single source of truth — every change router.replace()s a
// new URL and the server component re-validates + re-queries. The server is
// the only place values are trusted (uuid regex / status whitelists / LIKE
// escaping happen there); this component only writes the URL.
// ---------------------------------------------------------------------------

export type FilterBarOption = { value: string; label: string };

export type FilterBarSelect = {
  key: string; // searchParam name
  value: string; // current validated value ("" = all)
  options: FilterBarOption[];
  allLabel: string; // the "All …" first option
  ariaLabel?: string; // defaults to allLabel
  disabled?: boolean; // cascades: child select disabled until parent chosen
  resets?: string[]; // param keys cleared when this select changes (cascades)
};

export function FilterBar({
  basePath,
  search,
  selects = [],
  clearLabel,
}: {
  basePath: string;
  search?: { key?: string; value: string; placeholder: string };
  selects?: FilterBarSelect[];
  clearLabel: string;
}) {
  const router = useRouter();
  const searchKey = search?.key ?? "q";
  const [text, setText] = useState(search?.value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the search box in sync when the URL changes externally
  // (e.g. the "clear filters" link).
  useEffect(() => {
    setText(search?.value ?? "");
  }, [search?.value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Canonical current params (server-validated values passed back down).
  const currentParams: Record<string, string> = {};
  if (search?.value) currentParams[searchKey] = search.value;
  for (const s of selects) if (s.value) currentParams[s.key] = s.value;

  // Any filter change resets pagination (we simply never emit a page param).
  const buildHref = (overrides: Record<string, string>): string => {
    const merged = { ...currentParams, ...overrides };
    const p = new URLSearchParams();
    const orderedKeys = [searchKey, ...selects.map((s) => s.key)];
    for (const k of orderedKeys) {
      const v = merged[k];
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const apply = (overrides: Record<string, string>) => {
    router.replace(buildHref(overrides));
  };

  // Debounced (350 ms) text search.
  const onText = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ [searchKey]: v.trim() }), 350);
  };

  const onSelect = (def: FilterBarSelect, v: string) => {
    const overrides: Record<string, string> = { [def.key]: v };
    for (const r of def.resets ?? []) overrides[r] = "";
    apply(overrides);
  };

  const clearOverrides: Record<string, string> = { [searchKey]: "" };
  for (const s of selects) clearOverrides[s.key] = "";

  const hasFilters = Boolean(
    (search?.value ?? "") || selects.some((s) => s.value),
  );

  return (
    <div className="qfilters flt-bar">
      {search && (
        <input
          className="qfilters-search"
          type="search"
          value={text}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          onChange={(e) => onText(e.target.value)}
        />
      )}

      {selects.map((s) => (
        <select
          key={s.key}
          aria-label={s.ariaLabel ?? s.allLabel}
          value={s.value}
          disabled={s.disabled}
          onChange={(e) => onSelect(s, e.target.value)}
        >
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}

      {hasFilters && (
        <Link className="qfilters-clear" href={buildHref(clearOverrides)}>
          {clearLabel}
        </Link>
      )}
    </div>
  );
}
