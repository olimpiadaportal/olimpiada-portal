"use client";

// Website Content CMS — hierarchical, TEXT-ONLY editor (Admin-only).
//
// Three-step flow: pick a SECTION, then a MENU within it, then edit that menu's
// trilingual text entries. Nothing is shown until both a section and a menu are
// chosen. A single per-menu Save posts every changed entry (sequentially) to
// the `saveSiteContent` server action; Cancel restores the menu's fields to the
// values currently in effect. All data is driven by the registry passed in from
// the server page — this component holds no content of its own.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { saveSiteContent } from "@/lib/admin/siteContent";
import { FIELD_FONT_SIZE_OPTIONS } from "@/lib/admin/siteContentRegistry";

export type CmsEntry = {
  key: string;
  multiline: boolean;
  az: string;
  en: string;
  ru: string;
  isOverridden: boolean;
  // Optional per-field font size (px); null = site default.
  fontSize: number | null;
};
export type CmsMenu = { id: string; label: string; entries: CmsEntry[] };
export type CmsSection = { id: string; label: string; menus: CmsMenu[] };

export type ContentManagerStrings = {
  sectionLabel: string;
  menuLabel: string;
  selectSection: string;
  selectMenu: string;
  save: string;
  saving: string;
  saved: string;
  cancel: string;
  empty: string;
  emptyHint: string;
  usingDefault: string;
  overridden: string;
  langAz: string;
  langEn: string;
  langRu: string;
  errServer: string;
  fontSize: string;
  fontSizeDefault: string;
};

type Vals = { az: string; en: string; ru: string };

export function ContentManager({
  sections,
  strings,
}: {
  sections: CmsSection[];
  strings: ContentManagerStrings;
}) {
  const allEntries = useMemo(
    () => sections.flatMap((s) => s.menus.flatMap((m) => m.entries)),
    [sections],
  );

  const seed = useMemo(
    () =>
      Object.fromEntries(
        allEntries.map((e) => [e.key, { az: e.az, en: e.en, ru: e.ru }]),
      ) as Record<string, Vals>,
    [allEntries],
  );

  const seedSizes = useMemo(
    () =>
      Object.fromEntries(allEntries.map((e) => [e.key, e.fontSize])) as Record<
        string,
        number | null
      >,
    [allEntries],
  );

  const [values, setValues] = useState<Record<string, Vals>>(seed);
  const [baseline, setBaseline] = useState<Record<string, Vals>>(seed);
  const [sizes, setSizes] = useState<Record<string, number | null>>(seedSizes);
  const [baselineSizes, setBaselineSizes] =
    useState<Record<string, number | null>>(seedSizes);
  const [overridden, setOverridden] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allEntries.map((e) => [e.key, e.isOverridden])),
  );

  const [sectionId, setSectionId] = useState("");
  const [menuId, setMenuId] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const section = sections.find((s) => s.id === sectionId) ?? null;
  const menu = section?.menus.find((m) => m.id === menuId) ?? null;

  const setField = (key: string, loc: keyof Vals, v: string) => {
    setValues((cur) => ({ ...cur, [key]: { ...cur[key], [loc]: v } }));
    if (status !== "idle") setStatus("idle");
  };

  const changedKeys = (menu?.entries ?? [])
    .filter((e) => {
      const v = values[e.key];
      const b = baseline[e.key];
      return (
        v.az !== b.az ||
        v.en !== b.en ||
        v.ru !== b.ru ||
        sizes[e.key] !== baselineSizes[e.key]
      );
    })
    .map((e) => e.key);
  const dirty = changedKeys.length > 0;

  const onSave = () => {
    if (!dirty || pending) return;
    startTransition(async () => {
      let ok = true;
      const savedNow: string[] = [];
      for (const key of changedKeys) {
        const fd = new FormData();
        fd.set("__key", key);
        fd.set("az", values[key].az);
        fd.set("en", values[key].en);
        fd.set("ru", values[key].ru);
        fd.set("fontSize", sizes[key] == null ? "" : String(sizes[key]));
        const res = await saveSiteContent(null, fd);
        if (res?.ok) savedNow.push(key);
        else ok = false;
      }
      if (savedNow.length) {
        setBaseline((cur) => {
          const next = { ...cur };
          for (const k of savedNow) next[k] = { ...values[k] };
          return next;
        });
        setBaselineSizes((cur) => {
          const next = { ...cur };
          for (const k of savedNow) next[k] = sizes[k] ?? null;
          return next;
        });
        setOverridden((cur) => {
          const next = { ...cur };
          for (const k of savedNow) next[k] = true;
          return next;
        });
      }
      setStatus(ok ? "saved" : "error");
    });
  };

  const onCancel = () => {
    if (!menu) return;
    setValues((cur) => {
      const next = { ...cur };
      for (const e of menu.entries) next[e.key] = { ...baseline[e.key] };
      return next;
    });
    setSizes((cur) => {
      const next = { ...cur };
      for (const e of menu.entries) next[e.key] = baselineSizes[e.key] ?? null;
      return next;
    });
    setStatus("idle");
  };

  return (
    <div className="cms">
      <div className="cms-pickers">
        <label className="cms-picker">
          <span className="sfield-label">{strings.sectionLabel}</span>
          <select
            className="sfield-control sfield-select"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setMenuId("");
              setStatus("idle");
            }}
          >
            <option value="">{strings.selectSection}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cms-picker">
          <span className="sfield-label">{strings.menuLabel}</span>
          <select
            className="sfield-control sfield-select"
            value={menuId}
            disabled={!section}
            onChange={(e) => {
              setMenuId(e.target.value);
              setStatus("idle");
            }}
          >
            <option value="">{strings.selectMenu}</option>
            {(section?.menus ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {menu && menu.entries.length === 0 && (
        <p className="cms-empty">{strings.empty}</p>
      )}

      {menu && menu.entries.length > 0 && (
        <div className="cms-menu">
          <div className="cms-entries">
            {menu.entries.map((entry) => {
              const v = values[entry.key];
              const isOverridden = overridden[entry.key];
              return (
                <div className="sfield cms-entry" key={entry.key}>
                  <div className="sfield-head">
                    <code className="cms-key">{entry.key}</code>
                    <span
                      className={`sc-pill${isOverridden ? " sc-pill-custom" : ""}`}
                      aria-hidden
                    >
                      {isOverridden ? strings.overridden : strings.usingDefault}
                    </span>
                    {/* Compact per-field font size (px) — "" = site default. */}
                    <label
                      style={{
                        marginLeft: "auto",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "0.78rem",
                        opacity: 0.9,
                      }}
                    >
                      <span>{strings.fontSize}</span>
                      <select
                        className="sfield-control sfield-select"
                        style={{ width: "auto", padding: "2px 6px" }}
                        value={sizes[entry.key] == null ? "" : String(sizes[entry.key])}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSizes((cur) => ({
                            ...cur,
                            [entry.key]: v === "" ? null : Number(v),
                          }));
                          if (status !== "idle") setStatus("idle");
                        }}
                      >
                        <option value="">{strings.fontSizeDefault}</option>
                        {FIELD_FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}px
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div
                    className="tri-grid"
                    role="group"
                    aria-label={entry.key}
                  >
                    {(
                      [
                        ["az", strings.langAz],
                        ["en", strings.langEn],
                        ["ru", strings.langRu],
                      ] as const
                    ).map(([loc, label]) => (
                      <label className="tri-item" key={loc}>
                        <span className="tri-lang">{label}</span>
                        {entry.multiline ? (
                          <AutoTextarea
                            value={v[loc]}
                            onChange={(nv) => setField(entry.key, loc, nv)}
                          />
                        ) : (
                          <input
                            className="sfield-control"
                            type="text"
                            value={v[loc]}
                            onChange={(e) =>
                              setField(entry.key, loc, e.target.value)
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="sfield-help">{strings.emptyHint}</p>

          <div className="cms-actions">
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
              className="btn btn-ghost btn-sm"
              onClick={onCancel}
              disabled={!dirty || pending}
            >
              {strings.cancel}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={onSave}
              disabled={!dirty || pending}
            >
              {pending ? strings.saving : strings.save}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Textarea that grows to fit its content (long leads/descriptions).
function AutoTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // Fit on mount and whenever the value changes (e.g. Cancel/reset).
  useLayoutEffect(resize, [value]);
  useEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={ref}
      className="sfield-control"
      rows={2}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
    />
  );
}
