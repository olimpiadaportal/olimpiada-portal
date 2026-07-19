"use client";

// Parent-facing child-avatar picker (Add-Child wizard + Edit-Child form).
// Four states: Default (initials bubble), preset Boy, preset Girl, or an
// uploaded photo (client preview + replace/remove). FULLY CONTROLLED — the
// owning form holds the choice/file state and submits through the
// saveChildAvatar server action (client checks here are UX only; the server
// re-validates size/type from bytes). Labels arrive translated via `dict`.
import { useEffect, useMemo, useRef } from "react";

export type ChildAvatarChoice = "default" | "boy" | "girl" | "photo";

// Public preset assets (also referenced server-side in lib/childAvatar.ts).
const PRESET_SRC: Record<"boy" | "girl", string> = {
  boy: "/avatars/child-boy.png",
  girl: "/avatars/child-girl.png",
};

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

export function ChildAvatarPicker({
  choice,
  onChoiceChange,
  file,
  onFileChange,
  currentPhotoUrl = null,
  disabled = false,
  dict,
}: {
  choice: ChildAvatarChoice;
  onChoiceChange: (c: ChildAvatarChoice) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  /** Existing photo (edit mode, signed URL) shown until a new file is picked. */
  currentPhotoUrl?: string | null;
  disabled?: boolean;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const inputRef = useRef<HTMLInputElement>(null);

  // Client preview of the freshly picked file (revoked on change/unmount).
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const photoThumb = previewUrl ?? currentPhotoUrl;
  const hasPhotoState = choice === "photo" && !!photoThumb;

  function pickFile(list: FileList | null) {
    const f = list?.[0] ?? null;
    if (!f) return;
    // UX-only pre-checks (the server sniffs bytes + re-enforces the cap).
    if (f.size > MAX_BYTES) return;
    onFileChange(f);
    onChoiceChange("photo");
  }

  const optionCls = (on: boolean) => `cavp-opt${on ? " on" : ""}`;

  return (
    <div className="cavp">
      <div className="cavp-opts" role="radiogroup" aria-label={tt("addchild.avatar.title")}>
        {/* Default — the initials bubble */}
        <button
          type="button"
          role="radio"
          aria-checked={choice === "default"}
          className={optionCls(choice === "default")}
          onClick={() => onChoiceChange("default")}
          disabled={disabled}
        >
          <span className="cavp-thumb cavp-thumb-default" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </span>
          <span className="cavp-opt-label">{tt("addchild.avatar.default")}</span>
        </button>

        {/* Preset boy / girl */}
        {(["boy", "girl"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={choice === key}
            className={optionCls(choice === key)}
            onClick={() => onChoiceChange(key)}
            disabled={disabled}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cavp-thumb" src={PRESET_SRC[key]} alt="" width={56} height={56} />
            <span className="cavp-opt-label">{tt(`addchild.avatar.${key}`)}</span>
          </button>
        ))}

        {/* Upload photo */}
        <button
          type="button"
          role="radio"
          aria-checked={choice === "photo"}
          className={optionCls(choice === "photo")}
          onClick={() => {
            if (photoThumb) onChoiceChange("photo");
            else inputRef.current?.click();
          }}
          disabled={disabled}
        >
          {photoThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="cavp-thumb"
              src={photoThumb}
              alt={tt("addchild.avatar.photoSelected")}
              width={56}
              height={56}
            />
          ) : (
            <span className="cavp-thumb cavp-thumb-upload" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M4 20h16" />
              </svg>
            </span>
          )}
          <span className="cavp-opt-label">{tt("addchild.avatar.upload")}</span>
        </button>
      </div>

      {/* Hidden file input (shared by upload/replace). */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        disabled={disabled}
        onChange={(e) => {
          pickFile(e.currentTarget.files);
          // allow re-picking the same file
          e.currentTarget.value = "";
        }}
      />

      {hasPhotoState && (
        <div className="cavp-file-btns">
          <button
            type="button"
            className="btn-ghost cavp-file-btn"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            {tt("addchild.avatar.replace")}
          </button>
          <button
            type="button"
            className="cavp-remove-btn"
            onClick={() => {
              onFileChange(null);
              onChoiceChange("default");
            }}
            disabled={disabled}
          >
            {tt("addchild.avatar.removePhoto")}
          </button>
        </div>
      )}

      <p className="hint cavp-hint">
        {tt("addchild.avatar.hint")} {tt("addchild.avatar.requirements")}
      </p>
    </div>
  );
}
