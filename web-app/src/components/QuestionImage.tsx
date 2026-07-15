"use client";

// Question figure (migration 056/057 — attempt/review payloads carry an
// optional locale-aware image). Renders responsively between the question body
// and the options; clicking opens the full-size figure in the shared Modal
// (zoom for small diagrams). The URL is a PUBLIC-bucket URL resolved
// server-side (bucket+path → getPublicUrl) — this component never talks to
// Supabase. All strings arrive translated via props.
import { useState } from "react";
import { Modal } from "@/components/Modal";

export function QuestionImage({
  url,
  alt,
  hint,
  closeLabel,
}: {
  url: string;
  /** Translated alt text ("question image"). */
  alt: string;
  /** Translated zoom hint (title/aria on the clickable figure). */
  hint: string;
  /** Translated close label for the modal's × button. */
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tst-qimg-btn"
        onClick={() => setOpen(true)}
        title={hint}
        aria-label={hint}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="tst-qimg" loading="lazy" />
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={alt} closeLabel={closeLabel}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="tst-qimg-full" />
      </Modal>
    </>
  );
}
