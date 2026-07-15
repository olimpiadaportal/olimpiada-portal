"use client";

// "Sayt şrifti" (Website font) — part of the Website Content module.
//
// Lets an Administrator pick the sitewide font from the curated library and
// tune the base / heading / button sizes. NON-NEGOTIABLE: every font option
// and the selected-font line render the Azerbaijani glyph test
// ("Əlifba sınağı — ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ") IN THAT FONT, so missing
// ə/Ə support is visible before saving; the applied family always falls back
// to the safe Arial stack. A live preview (H1/H2/paragraph/button/input/table)
// updates instantly on any change; Save posts to the audited
// `saveSiteTypography` server action (whitelist + clamp re-run server-side).
import { useMemo, useRef, useState, useTransition } from "react";
import { saveSiteTypography } from "@/lib/admin/siteContent";
import {
  FONT_LIBRARY,
  AZ_GLYPH_TEST,
  GOOGLE_FONTS_PREVIEW_URL,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  fontStackFor,
  type SiteTypography as Typo,
} from "@/lib/admin/siteContentRegistry";

export type SiteTypographyStrings = {
  title: string;
  desc: string;
  fontLabel: string;
  searchPlaceholder: string;
  noMatches: string;
  baseSize: string;
  headingSize: string;
  buttonSize: string;
  previewTitle: string;
  pvHeading: string;
  pvSubheading: string;
  pvBody: string;
  pvButton: string;
  pvInput: string;
  pvThSubject: string;
  pvThResult: string;
  pvCellSubject: string;
  pvCellResult: string;
  save: string;
  saving: string;
  saved: string;
  errServer: string;
};

// Clamp helper mirrored from the server action (client side is UX only).
function clampSize(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

export function SiteTypography({
  initial,
  strings,
}: {
  initial: Typo;
  strings: SiteTypographyStrings;
}) {
  const [font, setFont] = useState(initial.fontFamily);
  const [baseSize, setBaseSize] = useState(initial.baseFontSize);
  const [headingSize, setHeadingSize] = useState(initial.headingFontSize);
  const [buttonSize, setButtonSize] = useState(initial.buttonFontSize);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? FONT_LIBRARY.filter((f) => f.name.toLowerCase().includes(q))
      : FONT_LIBRARY;
  }, [search]);

  const dirty =
    font !== initial.fontFamily ||
    baseSize !== initial.baseFontSize ||
    headingSize !== initial.headingFontSize ||
    buttonSize !== initial.buttonFontSize;

  const stack = fontStackFor(font);

  const onSave = () => {
    if (pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fontFamily", font);
      fd.set("baseFontSize", String(clampSize(baseSize, 16)));
      fd.set("headingFontSize", String(clampSize(headingSize, 32)));
      fd.set("buttonFontSize", String(clampSize(buttonSize, 15)));
      const res = await saveSiteTypography(null, fd);
      setStatus(res?.ok ? "saved" : "error");
    });
  };

  const sizeField = (
    label: string,
    value: number,
    set: (n: number) => void,
  ) => (
    <label className="sfield" style={{ minWidth: 130 }}>
      <span className="sfield-label">{label}</span>
      <input
        className="sfield-control"
        type="number"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        value={value}
        onChange={(e) => {
          set(clampSize(Number(e.target.value), value));
          if (status !== "idle") setStatus("idle");
        }}
      />
    </label>
  );

  return (
    <section className="cms" style={{ marginBottom: 28 }}>
      {/* React 19 hoists this stylesheet to <head>; loaded ONLY on this page. */}
      <link rel="stylesheet" href={GOOGLE_FONTS_PREVIEW_URL} />

      <div className="sfield-head" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{strings.title}</h2>
      </div>
      <p className="sfield-help" style={{ marginTop: 0 }}>
        {strings.desc}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {/* Searchable font picker — every option previews in its own font. */}
        <div
          ref={boxRef}
          className="sfield"
          style={{ position: "relative", flex: "1 1 320px", maxWidth: 460 }}
          onBlur={(e) => {
            // Close only when focus leaves the whole picker.
            if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
        >
          <span className="sfield-label">{strings.fontLabel}</span>
          <input
            className="sfield-control"
            type="text"
            role="combobox"
            aria-expanded={open}
            placeholder={strings.searchPlaceholder}
            value={open ? search : font}
            onFocus={() => {
              setSearch("");
              setOpen(true);
            }}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* Selected font's own glyph proof, always visible under the input. */}
          <span
            style={{
              display: "block",
              marginTop: 4,
              fontFamily: stack,
              fontSize: "0.95rem",
              opacity: 0.85,
            }}
          >
            {AZ_GLYPH_TEST}
          </span>
          {open && (
            <div
              role="listbox"
              style={{
                position: "absolute",
                zIndex: 30,
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: 320,
                overflowY: "auto",
                background: "var(--panel, #fff)",
                border: "1px solid var(--border, #d0d0d8)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              }}
            >
              {filtered.length === 0 && (
                <div style={{ padding: "10px 12px", opacity: 0.7 }}>
                  {strings.noMatches}
                </div>
              )}
              {filtered.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  role="option"
                  aria-selected={f.name === font}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setFont(f.name);
                    setOpen(false);
                    if (status !== "idle") setStatus("idle");
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background:
                      f.name === font ? "var(--accent-soft, rgba(124,58,237,0.12))" : "transparent",
                    border: 0,
                    borderBottom: "1px solid var(--border, #eee)",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 700, marginRight: 8 }}>{f.name}</span>
                  {/* The glyph test rendered IN this candidate font. */}
                  <span
                    style={{ fontFamily: fontStackFor(f.name), fontSize: "0.92rem" }}
                  >
                    {AZ_GLYPH_TEST}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {sizeField(strings.baseSize, baseSize, setBaseSize)}
        {sizeField(strings.headingSize, headingSize, setHeadingSize)}
        {sizeField(strings.buttonSize, buttonSize, setButtonSize)}
      </div>

      {/* LIVE preview — updates instantly, before save. */}
      <div style={{ marginTop: 16 }}>
        <span className="sfield-label">{strings.previewTitle}</span>
        <div
          style={{
            fontFamily: stack,
            fontSize: baseSize,
            border: "1px dashed var(--border, #c9c9d4)",
            borderRadius: 12,
            padding: "16px 18px",
            marginTop: 6,
            display: "grid",
            gap: 10,
          }}
        >
          <h1 style={{ margin: 0, fontSize: headingSize, lineHeight: 1.2 }}>
            {strings.pvHeading}
          </h1>
          <h2
            style={{
              margin: 0,
              fontSize: Math.round(headingSize * 0.72),
              lineHeight: 1.25,
            }}
          >
            {strings.pvSubheading}
          </h2>
          <p style={{ margin: 0 }}>
            {strings.pvBody} {AZ_GLYPH_TEST}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ fontFamily: stack, fontSize: buttonSize }}
            >
              {strings.pvButton}
            </button>
            <input
              className="sfield-control"
              style={{ fontFamily: stack, fontSize: baseSize, maxWidth: 240 }}
              placeholder={strings.pvInput}
              readOnly
            />
          </div>
          <table
            style={{
              borderCollapse: "collapse",
              fontSize: baseSize,
              maxWidth: 420,
            }}
          >
            <thead>
              <tr>
                {[strings.pvThSubject, strings.pvThResult].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "2px solid var(--border, #c9c9d4)",
                      padding: "6px 12px 6px 0",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "6px 12px 6px 0", borderBottom: "1px solid var(--border, #e2e2ea)" }}>
                  {strings.pvCellSubject}
                </td>
                <td style={{ padding: "6px 12px 6px 0", borderBottom: "1px solid var(--border, #e2e2ea)" }}>
                  {strings.pvCellResult}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="cms-actions" style={{ marginTop: 12 }}>
        {status === "error" && (
          <span className="inline-status err" role="alert">
            {strings.errServer}
          </span>
        )}
        {status === "saved" && (
          <span className="inline-status ok" role="status">
            {strings.saved}
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={onSave}
          disabled={!dirty || pending}
        >
          {pending ? strings.saving : strings.save}
        </button>
      </div>
    </section>
  );
}
