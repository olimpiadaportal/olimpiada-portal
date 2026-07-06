"use client";

// "New question" as a modal on /questions: the COMPLETE QuestionForm (same
// fields, same validation, same saveQuestion action) inside the shared Modal.
// On success the form returns { ok } (stay-mode, no redirect); we close the
// modal and refresh the list in place. Media upload stays on the edit page.
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { QuestionForm } from "@/components/QuestionForm";
import type { QuestionTypeRule } from "@/lib/admin/question-options";

export function NewQuestionModal({
  dict,
  options,
  typeRules,
}: {
  dict: Record<string, string>;
  options: Record<string, { value: string; label: string }[]>;
  typeRules: Record<string, QuestionTypeRule>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onSaved = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {tt("questions.new")}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={tt("qnew.title")}
        closeLabel={tt("modal.close")}
        wide
      >
        <p className="hint">{tt("qnew.mediaHint")}</p>
        <QuestionForm
          dict={dict}
          options={options}
          typeRules={typeRules}
          submitLabel={tt("qform.save")}
          stay
          onSaved={onSaved}
        />
      </Modal>
    </>
  );
}
