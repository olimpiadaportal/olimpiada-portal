import { isSupabaseConfigured } from "@/lib/env";

// Dashboard placeholder for the Admin Panel foundation. Professional shell, no
// business logic or fake data — real modules arrive in later stages.
export default function AdminHome() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">
          Admin Panel foundation — management modules are added in later stages.
        </p>
      </div>

      <div className="grid">
        <section className="card">
          <h3>Supabase</h3>
          <p className="muted">Shared backend connection.</p>
          <span className={isSupabaseConfigured ? "pill pill-ok" : "pill pill-warn"}>
            {isSupabaseConfigured ? "Configured" : "Not configured"}
          </span>
          {!isSupabaseConfigured && (
            <p className="hint">
              Copy <code>.env.local.example</code> → <code>.env.local</code> and add
              your Supabase URL + anon key.
            </p>
          )}
        </section>

        <section className="card">
          <h3>Access model</h3>
          <p className="muted">
            Administrator &amp; Content Manager only. Every privileged route is
            permission-checked server-side and backed by RLS. Content Managers never
            reach payments, audit, or settings.
          </p>
        </section>

        <section className="card">
          <h3>Next up</h3>
          <p className="muted">
            Admin login, permission-aware navigation, and content taxonomy (grades,
            subjects, topics, subtopics).
          </p>
        </section>
      </div>
    </div>
  );
}
