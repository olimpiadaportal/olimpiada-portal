import { isSupabaseConfigured } from "@/lib/env";

// Foundation home page. No business logic — just confirms the skeleton runs and
// whether the Supabase connection is configured. Real student/parent flows are
// added in later stages.
export default function Home() {
  return (
    <main className="container">
      <h1>Olimpiada Portal</h1>
      <p className="muted">Student &amp; Parent Web App — foundation skeleton.</p>

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
        Auth, dashboards, daily tasks, tests and reports are implemented in later
        stages. This page only verifies the app boots and can be configured.
      </p>
    </main>
  );
}
