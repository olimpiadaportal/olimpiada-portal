import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { revokeChildLinkAction } from "@/lib/admin/childLinks";
import { getLocale } from "@/i18n/server";
import { localStrings } from "../../../labels";

type State = { children?: Array<{ id: string; name: string; child_id: string | null; creator_name: string | null; adults: Array<{ parent_id: string; name: string | null }> }> };

export default async function ChildAccessAdminPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const status = await searchParams;
  const la = localStrings(await getLocale());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_child_link_state", { p_student: id });
  if (error) throw new Error("Unable to load shared child access");
  const child = ((data as State | null)?.children ?? [])[0];
  if (!child) notFound();
  return (
    <section className="page">
      <div className="page-head">
        <div><h1>{la("accounts.access.title")}</h1><p className="muted">{child.name} · {child.child_id ?? "—"}</p></div>
        <Link className="btn-ghost" href="/accounts">{la("accounts.access.back")}</Link>
      </div>
      {status.saved === "1" ? <p className="notice success" role="status">{la("accounts.access.saved")}</p> : null}
      {status.error === "1" ? <p className="notice danger" role="alert">{la("accounts.access.error")}</p> : null}
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
