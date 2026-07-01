"use client";

import { useActionState, useState } from "react";
import { saveNews, type NewsState } from "@/lib/admin/news";
import { localeNames, locales, type Locale } from "@/i18n/config";

type TransMap = Record<string, { title: string; body: string }>;
type Defaults = { slug: string; translations: TransMap };

export function NewsForm({
  dict,
  defaults,
  id,
  submitLabel,
  formId = "news-form",
  hideSubmit = false,
}: {
  dict: Record<string, string>;
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
  /** DOM id so an external top toolbar button can submit via `form="…"`. */
  formId?: string;
  /** Hide the in-form submit button when a top toolbar provides Save. */
  hideSubmit?: boolean;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<NewsState, FormData>(
    saveNews,
    null,
  );

  const [slug, setSlug] = useState(defaults?.slug ?? "");
  const [trans, setTrans] = useState<TransMap>(() => {
    const init: TransMap = {};
    for (const l of locales) {
      init[l] = {
        title: defaults?.translations?.[l]?.title ?? "",
        body: defaults?.translations?.[l]?.body ?? "",
      };
    }
    return init;
  });

  function set(loc: string, field: "title" | "body", value: string) {
    setTrans((p) => ({ ...p, [loc]: { ...p[loc], [field]: value } }));
  }

  return (
    <form id={formId} action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}

      <label className="field">
        <span className="field-label">{tt("news.field.slug")}</span>
        <input
          type="text"
          name="slug"
          value={slug}
          placeholder="my-article"
          onChange={(e) => setSlug(e.target.value)}
        />
      </label>
      <p className="hint">{tt("news.slugHint")}</p>
      <p className="hint">{tt("news.localesNote")}</p>

      {locales.map((l) => (
        <div key={l} style={{ marginTop: 14 }}>
          <h3>
            {localeNames[l as Locale]}
            {l === "az" && <span className="req"> *</span>}
          </h3>
          <label className="field">
            <span className="field-label">{tt("news.field.title")}</span>
            <input
              type="text"
              name={`title_${l}`}
              value={trans[l]?.title ?? ""}
              onChange={(e) => set(l, "title", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{tt("news.field.body")}</span>
            <textarea
              name={`body_${l}`}
              rows={5}
              value={trans[l]?.body ?? ""}
              onChange={(e) => set(l, "body", e.target.value)}
            />
          </label>
        </div>
      ))}

      {state?.error && <p className="form-error">{state.error}</p>}
      {!hideSubmit && (
        <button className="btn" type="submit" disabled={pending}>
          {pending ? tt("manage.saving") : submitLabel}
        </button>
      )}
    </form>
  );
}
