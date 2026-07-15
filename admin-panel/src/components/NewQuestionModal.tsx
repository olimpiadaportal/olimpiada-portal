"use client";

// "New question" as a modal on /questions: the COMPLETE QuestionForm (same
// fields, same validation, same saveQuestion action) inside the shared Modal.
// On success the form returns { ok } (stay-mode, no redirect); we close the
// modal and refresh the list in place. The optional question image is picked
// here too (deferred upload — saved together with the question in ONE submit).
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { QuestionForm } from "@/components/QuestionForm";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";

export function NewQuestionModal({
  dict,
  options,
  taxonomy,
}: {
  dict: Record<string, string>;
  options: Record<string, { value: string; label: string }[]>;
  taxonomy: QuestionTaxonomy;
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
        <QuestionForm
          dict={dict}
          options={options}
          taxonomy={taxonomy}
          submitLabel={tt("qform.save")}
          statusText={tt("qstatus.in_review")}
          stay
          withImagePicker
          onSaved={onSaved}
        />
      </Modal>
    </>
  );
}
