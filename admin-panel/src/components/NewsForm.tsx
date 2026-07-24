"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { saveNews, type NewsState } from "@/lib/admin/news";
import {
  isValidNewsCover,
  uploadAndAttachNewsCover,
} from "@/lib/newsCover";
import { localeNames, locales, type Locale } from "@/i18n/config";

type TransMap = Record<string, { title: string; body: string }>;
type Defaults = { slug: string; translations: TransMap };

// Strings for the OPTIONAL inline cover picker (create flow only) — the same
// news.cover.* dictionary strings the edit page's uploader uses.
export type NewsCoverStrings = {
  title: string;
  upload: string;
  uploading: string;
  remove: string;
  none: string;
  hint: string;
  continueEdit: string; // shown when the article was created but the upload failed
  /** Generic failure text for a rejected upload/attach call (network error). */
  error?: string;
};

// The edit page's Save button sits in a sticky toolbar OUTSIDE the <form>
// (associated via the form="…" attribute), where useFormStatus cannot observe
// the submission. NewsFormScope + NewsToolbarSave bridge the form's busy state
// out to that button; NewsForm publishes into the scope when one is present.
const PendingScope = createContext<{
  pending: boolean;
  setPending: (v: boolean) => void;
} | null>(null);

export function NewsFormScope({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  return (
    <PendingScope.Provider value={{ pending, setPending }}>
      {children}
    </PendingScope.Provider>
  );
}

export function NewsToolbarSave({
  formId,
  label,
  pendingLabel,
}: {
  formId: string;
  label: string;
  pendingLabel: string;
}) {
  const scope = useContext(PendingScope);
  return (
    <ActionButton
      className="btn"
      form={formId}
      pending={scope?.pending ?? false}
      pendingLabel={pendingLabel}
    >
      {label}
    </ActionButton>
  );
}

export function NewsForm({
  dict,
  defaults,
  id,
  submitLabel,
  formId = "news-form",
  hideSubmit = false,
  cover,
}: {
  dict: Record<string, string>;
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
  /** DOM id so an external top toolbar button can submit via `form="…"`. */
  formId?: string;
  /** Hide the in-form submit button when a top toolbar provides Save. */
  hideSubmit?: boolean;
  /**
   * When set on the CREATE form, an optional cover image can be picked before
   * submitting: the article is created in one submission, then the image is
   * uploaded + attached (same hardened attach action as the edit page) and the
   * form navigates to the edit page. Only meaningful when `id` is absent.
   */
  cover?: { strings: NewsCoverStrings };
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
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

  // ---- Optional cover image (create flow only) -----------------------------
  const coverEnabled = Boolean(cover) && !id;
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const handledRef = useRef(false);

  function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setCoverError(null);
    if (!file) return;
    // Client pre-check only (UX): the attach server action re-validates from
    // the actual stored bytes.
    if (!isValidNewsCover(file)) {
      setCoverError(cover?.strings.hint ?? "");
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  function onCoverRemove() {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    setCoverError(null);
  }

  // After a create-with-cover submission the server returns {ok, id} instead of
  // redirecting: upload + attach the picked image, then continue to the edit
  // page. On an upload failure the article already exists — surface the error
  // and offer the edit page (which has its own uploader) instead of resubmitting.
  useEffect(() => {
    if (!coverEnabled || !state?.ok || !state.id || handledRef.current) return;
    handledRef.current = true;
    const newsId = state.id;
    setCreatedId(newsId);
    (async () => {
      if (coverFile) {
        setUploading(true);
        try {
          const err = await uploadAndAttachNewsCover(newsId, coverFile);
          if (err) {
            setCoverError(err);
            return;
          }
        } catch {
          // A rejected invocation (network failure) must not strand
          // uploading=true — the Save button would spin forever. The article
          // already exists, so surface the error + the continue-to-edit link.
          setCoverError(cover?.strings.error ?? cover?.strings.hint ?? "");
          return;
        } finally {
          setUploading(false);
        }
      }
      router.push(`/news/${newsId}/edit`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, coverEnabled]);

  const busy = pending || uploading;
  // Once created, block re-submitting (it would create a duplicate article).
  const submitDisabled = busy || createdId !== null;

  // Mirror busy into the surrounding NewsFormScope (edit page toolbar Save).
  const scope = useContext(PendingScope);
  const setScopePending = scope?.setPending;
  useEffect(() => {
    setScopePending?.(busy);
  }, [busy, setScopePending]);

  return (
    <form id={formId} action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}
      {/* One-submission create with a pending cover: ask the server to return
          the new id instead of redirecting. Without a file the server redirects
          to the edit page exactly like before. */}
      {coverEnabled && coverFile && (
        <input type="hidden" name="__afterCreate" value="return" />
      )}

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

      {coverEnabled && cover && (
        <div className="media-box" style={{ marginTop: 14 }}>
          <h3>{cover.strings.title}</h3>

          {coverPreview ? (
            <div className="media-current">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverPreview} alt="" className="media-preview" />
              <button
                type="button"
                className="link-danger"
                onClick={onCoverRemove}
                disabled={busy}
              >
                {cover.strings.remove}
              </button>
            </div>
          ) : (
            <p className="muted">{cover.strings.none}</p>
          )}

          <label className="btn-ghost media-upload">
            {uploading ? cover.strings.uploading : cover.strings.upload}
            <input
              type="file"
              accept="image/*"
              onChange={onCoverChange}
              disabled={busy || createdId !== null}
              hidden
            />
          </label>
          <p className="hint">{cover.strings.hint}</p>
          {coverError && <p className="form-error">{coverError}</p>}
          {/* The article was created but the image failed: continue on the edit
              page, which has the standalone uploader for a retry. */}
          {coverError && createdId && (
            <p>
              <a className="btn-ghost" href={`/news/${createdId}/edit`}>
                {cover.strings.continueEdit}
              </a>
            </p>
          )}
        </div>
      )}

      {state?.error && <p className="form-error">{state.error}</p>}
      {!hideSubmit && (
        <ActionButton
          className="btn"
          pending={busy}
          pendingLabel={tt("manage.saving")}
          disabled={submitDisabled}
        >
          {submitLabel}
        </ActionButton>
      )}
    </form>
  );
}
