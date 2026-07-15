"use client";

// Maintenance splash (owner item 12) — same markup/classes as the old inline
// server JSX in src/app/layout.tsx, now a client component that POLLS
// /api/maintenance-status every 4s and router.refresh()es the moment the flag
// flips off, so visitors auto-exit maintenance within ~0–5s. It keeps polling
// after a refresh: if the server's 4s TTL still served a stale "on", the next
// tick refreshes again; once the layout re-renders without maintenance this
// component unmounts and polling stops. It also live-updates the notice text
// if the admin edits the message while maintenance stays on.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 4000;

export function MaintenanceSplash({
  title,
  body,
  locale,
}: {
  /** Server-resolved trilingual strings for the CURRENT locale. */
  title: string;
  body: string;
  locale: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState(body);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/maintenance-status", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const j = (await res.json()) as {
          enabled?: boolean;
          message?: Record<string, string>;
        };
        if (stopped) return;
        if (j.enabled === false) {
          // Maintenance is over — re-render the server layout (visitors exit
          // without a manual reload).
          router.refresh();
        } else if (j.message) {
          const m = j.message[locale] || j.message.az || "";
          if (m) setMsg(m);
        }
      } catch {
        // Network hiccup — keep showing the splash; next tick retries.
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [router, locale]);

  return (
    <div className="maintenance-splash">
      <div className="maintenance-card">
        <span className="maintenance-badge" aria-hidden="true">
          ⚙
        </span>
        <h1>{title}</h1>
        <p>{msg || body}</p>
      </div>
    </div>
  );
}
