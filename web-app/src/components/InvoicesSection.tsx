"use client";

// R8 billing — invoices section (owner-approved static demo). Contains:
//   - an invoice email-notification toggle (local demo state, styled switch)
//   - the recipient email (real parent email passed from the server) with
//     inert "Change email" / "Request invoice by email" demo buttons
//   - a demo invoice history table (rows are built server-side so every cell
//     is already translated; only the toggle needs client state).
// All copy arrives via the `strings` dict — this component never touches i18n.
import { useState } from "react";

export type InvoiceRow = {
  id: string;
  date: string;
  plan: string;
  subjects: string;
  amount: string;
  status: string;
};

export function InvoicesSection({
  email,
  rows,
  strings,
}: {
  email: string;
  rows: InvoiceRow[];
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const [emailOn, setEmailOn] = useState(true);

  return (
    <div className="billing-panel">
      <div className="billing-invmail">
        <div className="billing-invmail-text">
          <span className="billing-invmail-title">{s("billing.emailToggle")}</span>
          <span className="billing-invmail-hint">{s("billing.emailToggleHint")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={emailOn}
          aria-label={s("billing.emailToggle")}
          className={`billing-switch${emailOn ? " on" : ""}`}
          onClick={() => setEmailOn((v) => !v)}
        >
          <span className="billing-switch-thumb" aria-hidden="true" />
        </button>
      </div>

      <div className="billing-email-row">
        <span className="billing-row-label">{s("billing.recipient")}</span>
        <span className="billing-email">{email}</span>
        <button
          type="button"
          className="billing-btn inert"
          aria-disabled="true"
          title={s("billing.soon")}
        >
          {s("billing.changeEmail")}
        </button>
        <button
          type="button"
          className="billing-btn inert"
          aria-disabled="true"
          title={s("billing.soon")}
        >
          {s("billing.requestInvoice")}
        </button>
      </div>

      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>{s("billing.col.id")}</th>
              <th>{s("billing.col.date")}</th>
              <th>{s("billing.col.plan")}</th>
              <th>{s("billing.col.subjects")}</th>
              <th>{s("billing.col.amount")}</th>
              <th>{s("billing.col.status")}</th>
              <th>{s("billing.col.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.date}</td>
                <td>{r.plan}</td>
                <td>{r.subjects}</td>
                <td>{r.amount}</td>
                <td>
                  <span className="billing-pill ok">{r.status}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="billing-dl"
                    aria-disabled="true"
                    title={s("billing.soon")}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3v12" />
                      <path d="m7 11 5 5 5-5" />
                      <path d="M4 21h16" />
                    </svg>
                    {s("billing.download")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
