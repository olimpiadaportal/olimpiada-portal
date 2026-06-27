import { isSupabaseConfigured } from "@/lib/env";
import { getT } from "@/i18n/server";

// Foundation home page. No business logic — confirms the skeleton runs and whether
// Supabase is configured. Real student/parent flows arrive in later stages.
export default async function Home() {
  const t = await getT();

  return (
    <main className="container">
      <h1>{t("app.brand")}</h1>
      <p className="muted">{t("home.subtitle")}</p>

      <div className="card">
        <strong>{t("supabase.heading")}: </strong>
        {isSupabaseConfigured ? (
          <span className="ok">{t("supabase.configured")}</span>
        ) : (
          <span className="warn">{t("supabase.notConfigured")}</span>
        )}
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        {t("home.note")}
      </p>
    </main>
  );
}
