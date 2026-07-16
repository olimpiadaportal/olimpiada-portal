"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  subscribeChild,
  quoteSubscription,
  type SubscribeState,
  type QuoteResult,
} from "@/lib/auth/subscriptionService";
import { useT } from "@/i18n/I18nProvider";
import { subjectLabel } from "@/lib/subjectLabel";

type Subj = { id: string; code: string | null; name: string; prices: Record<string, number> };

const INTERVAL_KEY: Record<string, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

export function SubscribeForm({
  studentId,
  subjects,
  dict,
}: {
  studentId: string;
  subjects: Subj[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  // Locale-aware subject labels (subj.<code>) via the app-wide provider dict.
  const t = useT();
  const [state, action, pending] = useActionState<SubscribeState, FormData>(
    subscribeChild,
    null,
  );
  const [interval, setIntervalState] = useState("month");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // Cosmetic, instant client subtotal (the server reprices authoritatively below).
  const subtotal = Array.from(sel).reduce(
    (sum, id) => sum + (subjects.find((s) => s.id === id)?.prices[interval] ?? 0),
    0,
  );

  // Live, AUTHORITATIVE preview: ask the server for base/discount/total whenever the
  // selection or interval changes (sibling discount is computed server-side).
  useEffect(() => {
    const ids = Array.from(sel);
    if (ids.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    quoteSubscription({ studentId, interval, subjectIds: ids }).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [sel, interval, studentId]);

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (state?.ok && state.result) {
    const r = state.result;
    return (
      <div className="card">
        <p>
          <strong>{tt("sub.done")}</strong>
        </p>
        {r.childUniqueId && (
          <div style={{ margin: "12px 0" }}>
            <p className="muted">{tt("parent.child.idLabel")}:</p>
            <p style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "3px" }}>
              <code>{r.childUniqueId}</code>
            </p>
            <p className="muted">{tt("parent.child.idNote")}</p>
          </div>
        )}
        <ul className="clean">
          <li>
            {tt("sub.base")}: {r.base} {r.currency}
          </li>
          {r.discount_percent > 0 && (
            <li>
              {tt("sub.discount")}: −{r.discount_percent}% (−{r.discount} {r.currency})
            </li>
          )}
          <li>
            {tt("sub.total")}: <strong>{r.total} {r.currency}</strong> /{" "}
            {tt(INTERVAL_KEY[interval])}
          </li>
          <li>
            {tt("sub.trial")}: {r.trial_days} {tt("sub.days")}
          </li>
        </ul>
        <Link className="btn" href="/dashboard">
          {tt("parent.dash.title")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="form" style={{ maxWidth: 560 }}>
      <input type="hidden" name="student_id" value={studentId} />
      {Array.from(sel).map((id) => (
        <input key={id} type="hidden" name="subject" value={id} />
      ))}
      <input type="hidden" name="interval" value={interval} />

      {/* 1) Subjects FIRST (checkboxes). */}
      <div>
        <span className="field-label">{tt("sub.subjects")}</span>
        {subjects.length === 0 ? (
          <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
        ) : (
          subjects.map((s) => (
            <label
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 0",
              }}
            >
              <span>
                <input
                  type="checkbox"
                  checked={sel.has(s.id)}
                  onChange={() => toggle(s.id)}
                />{" "}
                {subjectLabel(t, s.code, s.name)}
              </span>
              <span className="muted">{s.prices[interval] ?? "—"} AZN</span>
            </label>
          ))
        )}
      </div>

      {/* 2) Live subtotal. */}
      <p className="muted" style={{ marginTop: 8 }}>
        {tt("sub.subtotal")}: <strong>{subtotal} AZN</strong>
      </p>

      {/* 3) Billing-period selector (recomputes the payable amount). */}
      <div style={{ marginTop: 14 }}>
        <span className="field-label">{tt("sub.interval")}</span>
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          {["week", "month", "year"].map((iv) => (
            <label key={iv} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="interval_choice"
                value={iv}
                checked={interval === iv}
                onChange={() => setIntervalState(iv)}
              />
              {tt(INTERVAL_KEY[iv])}
            </label>
          ))}
        </div>
      </div>

      {/* 4) Authoritative server preview: base / sibling discount / total. */}
      <div className="card" style={{ marginTop: 14 }}>
        {sel.size === 0 ? (
          <p className="muted">{tt("sub.previewHint")}</p>
        ) : quote && quote.ok ? (
          <ul className="clean">
            <li>
              {tt("sub.base")}: {quote.base} {quote.currency}
            </li>
            <li>
              {tt("sub.discount")}:{" "}
              {quote.discount_percent > 0
                ? `−${quote.discount_percent}% (−${quote.discount} ${quote.currency})`
                : `0% (${tt("sub.noSibling")})`}
            </li>
            <li>
              {tt("sub.totalNow")}:{" "}
              <strong>
                {quote.total} {quote.currency}
              </strong>{" "}
              / {tt(INTERVAL_KEY[interval])}
            </li>
            <li className="muted">
              {tt("sub.trial")}: {quote.trial_days} {tt("sub.days")}
            </li>
          </ul>
        ) : (
          <p className="muted">{tt("sub.calculating")}</p>
        )}
      </div>

      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending || sel.size === 0}>
        {pending ? tt("sub.submitting") : tt("sub.submit")}
      </button>
    </form>
  );
}
