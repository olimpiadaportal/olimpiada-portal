"use client";

// Notification template management (Admin-only). Templates are grouped by code,
// showing the az/en/ru locales; create/edit/delete run through the shared Modal
// and the lib/admin/notifications server actions (all validation is server-side).
import { useEffect, useState, useTransition, useActionState } from "react";
import { Modal } from "@/components/Modal";
import {
  saveTemplate,
  deleteTemplate,
  type TemplateState,
} from "@/lib/admin/notifications";
import type { TemplateRow } from "@/components/NotificationComposer";

const LOCALES = ["az", "en", "ru"] as const;

export type TemplatesStrings = {
  heading: string;
  new: string;
  newTitle: string;
  editTitle: string;
  code: string;
  codePlaceholder: string;
  codeHint: string;
  locale: string;
  subject: string;
  body: string;
  save: string;
  saving: string;
  saved: string;
  create: string;
  creating: string;
  edit: string;
  delete: string;
  deleteTitle: string;
  deleteText: string;
  deleteConfirm: string;
  deleting: string;
  none: string;
  missing: string; // "not set" pill for a missing locale
  empty: string; // empty-body placeholder in the list
  cancel: string;
  close: string;
  working: string;
};

type Grouped = { code: string; byLocale: Record<string, TemplateRow> };

function group(templates: TemplateRow[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const tpl of templates) {
    const g = map.get(tpl.code) ?? { code: tpl.code, byLocale: {} };
    g.byLocale[tpl.locale] = tpl;
    map.set(tpl.code, g);
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; row: TemplateRow }
  | { kind: "delete"; code: string; rows: TemplateRow[] }
  | null;

export function NotificationTemplates({
  templates,
  strings,
}: {
  templates: TemplateRow[];
  strings: TemplatesStrings;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const groups = group(templates);

  return (
    <div>
      <div className="row-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="btn" onClick={() => setModal({ kind: "create" })}>
          {strings.new}
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="muted">{strings.none}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{strings.code}</th>
                {LOCALES.map((l) => (
                  <th key={l}>{l.toUpperCase()}</th>
                ))}
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.code}>
                  <td style={{ fontWeight: 600 }}>{g.code}</td>
                  {LOCALES.map((l) => {
                    const row = g.byLocale[l];
                    return (
                      <td key={l}>
                        {row ? (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            style={{ maxWidth: 220, textAlign: "left" }}
                            title={row.body}
                            onClick={() => setModal({ kind: "edit", row })}
                          >
                            <span
                              style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row.subject || strings.empty}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() =>
                              setModal({
                                kind: "edit",
                                row: {
                                  id: "",
                                  code: g.code,
                                  locale: l,
                                  subject: "",
                                  body: "",
                                },
                              })
                            }
                          >
                            <span className="pill pill-muted">{strings.missing}</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="row-actions nowrap">
                    {(() => {
                      const existing = LOCALES.map((l) => g.byLocale[l]).filter(
                        (r): r is TemplateRow => Boolean(r && r.id),
                      );
                      return existing.length > 0 ? (
                        <button
                          type="button"
                          className="btn-warn btn-sm"
                          onClick={() =>
                            setModal({ kind: "delete", code: g.code, rows: existing })
                          }
                        >
                          {strings.delete}
                        </button>
                      ) : null;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create */}
      <Modal
        isOpen={modal?.kind === "create"}
        onClose={() => setModal(null)}
        title={strings.newTitle}
        closeLabel={strings.close}
      >
        {modal?.kind === "create" && (
          <TemplateForm
            mode="create"
            strings={strings}
            onSuccess={() => setModal(null)}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* Edit */}
      <Modal
        isOpen={modal?.kind === "edit"}
        onClose={() => setModal(null)}
        title={strings.editTitle}
        closeLabel={strings.close}
      >
        {modal?.kind === "edit" && (
          <TemplateForm
            key={`${modal.row.code}:${modal.row.locale}`}
            mode="edit"
            row={modal.row}
            strings={strings}
            onSuccess={() => setModal(null)}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={modal?.kind === "delete"}
        onClose={() => setModal(null)}
        title={strings.deleteTitle}
        closeLabel={strings.close}
      >
        {modal?.kind === "delete" && (
          <DeleteConfirm
            key={modal.code}
            code={modal.code}
            rows={modal.rows}
            strings={strings}
            onDone={() => setModal(null)}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function TemplateForm({
  mode,
  row,
  strings,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  row?: TemplateRow;
  strings: TemplatesStrings;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateState, FormData>(
    saveTemplate,
    null,
  );
  const [code, setCode] = useState(row?.code ?? "");
  const [locale, setLocale] = useState(row?.locale ?? "az");
  const [subject, setSubject] = useState(row?.subject ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  // On edit of an existing locale, code+locale are fixed (they form the key).
  const lockKey = mode === "edit" && Boolean(row?.id);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  const canSubmit = Boolean(code.trim() && body.trim()) && !pending;

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="form-grid">
        <label className="field">
          <span>{strings.code}</span>
          <input
            name="code"
            maxLength={60}
            required
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={strings.codePlaceholder}
            readOnly={lockKey}
          />
        </label>
        <label className="field">
          <span>{strings.locale}</span>
          <select
            name="locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            disabled={lockKey}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          {/* A disabled select does not submit — mirror the value. */}
          {lockKey && <input type="hidden" name="locale" value={locale} />}
        </label>
      </div>

      <label className="field">
        <span>{strings.subject}</span>
        <input
          name="subject"
          maxLength={200}
          autoComplete="off"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label className="field">
        <span>{strings.body}</span>
        <textarea
          name="body"
          maxLength={2000}
          rows={4}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        {strings.codeHint}
      </span>

      {state?.error && <p className="form-error">{state.error}</p>}

      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn" type="submit" disabled={!canSubmit}>
          {mode === "create"
            ? pending
              ? strings.creating
              : strings.create
            : pending
              ? strings.saving
              : strings.save}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
          {strings.cancel}
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  code,
  rows,
  strings,
  onDone,
  onCancel,
}: {
  code: string;
  rows: TemplateRow[];
  strings: TemplatesStrings;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        {strings.deleteText}
      </p>
      <p style={{ margin: 0, fontWeight: 600 }}>{code}</p>
      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="btn-warn"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              // Delete every locale row for this code (each is keyed by its id).
              for (const r of rows) {
                const fd = new FormData();
                fd.set("id", r.id);
                await deleteTemplate(fd);
              }
              onDone();
            })
          }
        >
          {pending ? strings.deleting : strings.deleteConfirm}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
          {strings.cancel}
        </button>
      </div>
    </div>
  );
}
