"use client";

// "Export Data" — downloads the Accounts workbook from /api/accounts/export.
//
// The button is UX only. Every decision that matters (who may export, what the
// query returns, what the audit log records) is made server-side in the route;
// nothing here is trusted, and nothing here can widen what the route returns.
//
// Fetched rather than linked so the button can show real pending state, stay
// disabled while the file is being generated, and report success or failure —
// a plain <a href> would give none of that and would leave the admin staring at
// a page that appears to have done nothing.
import { useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import { EXPORT_FILENAME_RE, exportFilename } from "@/lib/admin/accounts-export";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AccountsExportStrings = {
  button: string;
  pending: string;
  done: string;
  failed: string;
  signedOut: string;
  forbidden: string;
  hint: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// Last-resort name, used only if the response somehow arrives without a
// Content-Disposition. The server's name is the canonical one (Baku wall
// clock); this one is the browser's clock, which for this team is the same.
function fallbackFilename(): string {
  const d = new Date();
  return exportFilename(
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(
      d.getHours(),
    )}-${pad2(d.getMinutes())}`,
  );
}

// The header is ours, but a filename arriving over the wire is still a
// filename: anything that is not the exact shape the server builds is dropped.
function filenameFrom(disposition: string | null): string {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  const name = match?.[1] ?? "";
  return EXPORT_FILENAME_RE.test(name) ? name : fallbackFilename();
}

export function AccountsExportButton({
  strings,
}: {
  strings: AccountsExportStrings;
}) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    if (pending) return;
    setPending(true);
    setNote(null);
    try {
      // no-store on both sides: the requirement is that the numbers are read at
      // click time, so a 304 or a bfcache hit would be a bug, not an
      // optimisation.
      const res = await fetch("/api/accounts/export", { cache: "no-store" });
      const type = res.headers.get("Content-Type") ?? "";

      if (!res.ok) {
        // The status names the refusal, so the fallback is never a guess: 401
        // is a session that is gone and 403 is a session that is fine on an
        // account that may not export — telling the second one to sign in again
        // would send a signed-in content manager to fix nothing.
        //
        // The route only ever returns its own trilingual message in the body,
        // never a database error, so that message wins when there is one.
        let message =
          res.status === 401
            ? strings.signedOut
            : res.status === 403
              ? strings.forbidden
              : strings.failed;
        if (type.includes("application/json")) {
          const body: unknown = await res.json().catch(() => null);
          const fromServer =
            body && typeof body === "object" && "error" in body
              ? (body as { error?: unknown }).error
              : null;
          if (typeof fromServer === "string" && fromServer) message = fromServer;
        }
        setNote({ ok: false, text: message });
        return;
      }

      // A 200 that is not a spreadsheet means the request was redirected and
      // fetch followed it. The route itself no longer redirects — it answers
      // 401/403 above — so the only thing left that can redirect this request
      // is the middleware's 30-minute idle logout handing back the login page,
      // which really is an expired session. Saying so beats saving an HTML file
      // named .xlsx.
      if (!type.includes(XLSX_MIME)) {
        setNote({ ok: false, text: strings.signedOut });
        return;
      }

      const name = filenameFrom(res.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setNote({ ok: true, text: strings.done });
    } catch {
      // Network failure / aborted request. Never surface the exception text.
      setNote({ ok: false, text: strings.failed });
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ActionButton
        type="button"
        className="btn"
        pending={pending}
        pendingLabel={strings.pending}
        title={strings.hint}
        onClick={download}
      >
        {strings.button}
      </ActionButton>
      {note && (
        <span
          className={note.ok ? "form-ok" : "form-error"}
          role="status"
          aria-live="polite"
        >
          {note.text}
        </span>
      )}
    </div>
  );
}
