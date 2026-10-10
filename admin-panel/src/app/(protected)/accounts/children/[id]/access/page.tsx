import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { revokeChildLinkAction } from "@/lib/admin/childLinks";
import { grantTrialExtensionAction } from "@/lib/admin/trialExtension";
import { getLocale } from "@/i18n/server";
import { localStrings } from "../../../labels";

// child_free_trial (migrations 140/183) — an admin passes its access check.
type Trial = {
  active?: boolean;
  used?: boolean;
  ends_at?: string | null;
  extended?: boolean;
  subjects?: Array<{ id: string; name: string }>;
};

const TRIAL_ERRORS = new Set(["noTrial", "stillActive", "limit", "notAdmin", "generic"]);

type State = { children?: Array<{ id: string; name: string; child_id: string | null; creator_name: string | null; adults: Array<{ parent_id: string; name: string | null }> }> };

export default async function ChildAccessAdminPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; trialSaved?: string; trialError?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const status = await searchParams;
  const locale = await getLocale();
  const la = localStrings(locale);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_child_link_state", { p_student: id });
  if (error) throw new Error("Unable to load shared child access");
  const child = ((data as State | null)?.children ?? [])[0];
  if (!child) notFound();
  const { data: trialData } = await supabase.rpc("child_free_trial", { p_student: id });
  const trial = (trialData ?? {}) as Trial;
  const endsAt = trial.ends_at
    ? new Intl.DateTimeFormat(locale === "az" ? "az-Latn-AZ" : locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Baku",
      }).format(new Date(trial.ends_at))
    : "—";
  const trialError =
    status.trialError && TRIAL_ERRORS.has(status.trialError) ? status.trialError : null;
  return (
    <section className="page">
      <div className="page-head">
        <div><h1>{la("accounts.access.title")}</h1><p className="muted">{child.name} · {child.child_id ?? "—"}</p></div>
        <Link className="btn-ghost" href="/accounts">{la("accounts.access.back")}</Link>
      </div>
      {status.saved === "1" ? <p className="notice success" role="status">{la("accounts.access.saved")}</p> : null}
      {status.error === "1" ? <p className="notice danger" role="alert">{la("accounts.access.error")}</p> : null}
      {status.trialSaved === "1" ? <p className="notice success" role="status">{la("accounts.trial.saved")}</p> : null}
      {trialError ? <p className="notice danger" role="alert">{la(`accounts.trial.err.${trialError}`)}</p> : null}
      <div className="card stack">
        <h2>{la("accounts.trial.title")}</h2>
        {!trial.used ? (
          <p className="muted">{la("accounts.trial.none")}</p>
        ) : (
          <>
            <p>
              <span className={trial.active ? "pill pill-ok" : "pill"}>
                {trial.active ? la("accounts.trial.active") : la("accounts.trial.ended")}
              </span>{" "}
              {trial.extended ? <span className="pill">{la("accounts.trial.extended")}</span> : null}
            </p>
            <p><strong>{la("accounts.trial.endsAt")}:</strong> {endsAt}</p>
            <p>
              <strong>{la("accounts.trial.subjects")}:</strong>{" "}
              {(trial.subjects ?? []).map((s) => s.name).join(", ") || "—"}
            </p>
            {/* Only once every window has ended — the RPC refuses otherwise. */}
            {!trial.active ? (
              <form action={grantTrialExtensionAction} className="stack">
                <input type="hidden" name="student_id" value={child.id} />
                <label className="field">
                  <span>{la("accounts.trial.extendNote")}</span>
                  <input name="note" maxLength={300} />
                </label>
                <p className="muted">{la("accounts.trial.extendHint")}</p>
                <div>
                  <button className="btn" type="submit">{la("accounts.trial.extend")}</button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </div>
      <div className="card">
        <p><strong>{la("accounts.access.owner")}:</strong> {child.creator_name ?? "—"}</p>
        {child.adults.length === 0 ? <p className="muted">{la("accounts.access.none")}</p> : (
          <div className="stack">
            {child.adults.map((adult) => (
              <form action={revokeChildLinkAction} className="head-row" key={adult.parent_id}>
                <input type="hidden" name="student_id" value={child.id} />
                <input type="hidden" name="parent_id" value={adult.parent_id} />
                <span>{adult.name ?? "—"}</span>
                <button className="btn-ghost" type="submit">{la("accounts.access.remove")}</button>
              </form>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
