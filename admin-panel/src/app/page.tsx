import { isSupabaseConfigured } from "@/lib/env";

// Foundation home page for the Admin Panel. No business logic — confirms the
// skeleton runs and whether Supabase is configured. Admin login, permission-aware
// navigation, and content modules are added in later stages.
export default function AdminHome() {
  return (
    <main className="container">
      <h1>Olimpiada Portal — Admin</h1>
      <p className="muted">
        Administrator &amp; Content Manager panel — foundation skeleton.
      </p>

      <div className="card">
        <strong>Supabase connection: </strong>
        {isSupabaseConfigured ? (
          <span className="ok">configured ✓</span>
        ) : (
          <span className="warn">
            not configured — copy <code>.env.local.example</code> to{" "}
            <code>.env.local</code> and add your Supabase URL + anon key
          </span>
        )}
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        Admin login, permission-aware sidebar, taxonomy, question management and
        review workflows are implemented in later stages. Every privileged route is
        permission-checked server-side and backed by RLS.
      </p>
    </main>
  );
}
