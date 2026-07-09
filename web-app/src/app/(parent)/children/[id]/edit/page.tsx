import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { ChildInfoEditForm } from "@/components/ChildInfoEditForm";

// All i18n keys the (client) edit form needs, resolved server-side into a dict.
const KEYS = [
  "parent.child.first", "parent.child.last",
  "addchild.field.city", "addchild.field.school", "addchild.field.grade",
  "addchild.field.selectCity", "addchild.field.selectSchool",
  "addchild.field.selectGrade", "addchild.field.cityFirst",
  "addchild.field.privateSchools", "addchild.field.publicSchools",
  "parent.child.idLabel", "parent.dash.idPending",
  "childedit.save", "childedit.saving", "childedit.saved", "childedit.back",
  "childedit.internalId", "childedit.idNote",
  // validation-error keys the action may return:
  "auth.child.err.firstNameRequired", "auth.child.err.lastNameRequired",
  "auth.child.err.nameTooLong",
  "addchild.err.cityRequired", "addchild.err.schoolRequired",
  "addchild.err.gradeRequired",
  "childedit.err.generic", "childedit.err.notYourChild",
];

// Parent edits a child's profile info after creation (name/grade/city/school).
// Ownership is verified here (page) AND again inside updateChildProfile.
export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parent = await requireParent();
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("students")
    .select(
      "profile_id, first_name, last_name, child_unique_id, class_grade, " +
        "grade_id, district_id, school_id, created_by_parent_profile_id",
    )
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) {
    notFound();
  }
  const c = child as any;

  // Catalogs: cities (active districts), schools (active, private-first), grades
  // — same data-loading pattern the Add-Child flow uses.
  const [{ data: cityRows }, { data: schoolRows }, { data: gradeRows }] = await Promise.all([
    supabase.from("districts").select("id, name").eq("status", "active").order("name"),
    supabase
      .from("schools")
      .select("id, name, district_id, is_private, school_number")
      .eq("status", "active")
      .order("is_private", { ascending: false })
      .order("school_number", { ascending: true, nullsFirst: false })
      .order("name"),
    supabase.from("grades").select("id, level, name").order("level", { ascending: true }),
  ]);

  const cities = (cityRows ?? []) as { id: string; name: string }[];
  const schools = (schoolRows ?? []) as {
    id: string;
    name: string;
    district_id: string | null;
    is_private: boolean;
    school_number: number | null;
  }[];
  const grades = (gradeRows ?? []) as { id: string; level: number; name: string }[];

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  const childName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();

  return (
    <section className="prose wiz-page">
      <div className="wiz-head">
        <h1>{t("childedit.title")}</h1>
        <Link className="btn-ghost" href="/dashboard">
          {t("parent.dash.title")}
        </Link>
      </div>
      <p className="muted">
        {t("childedit.intro")}
        {childName ? ` — ${childName}` : ""}
      </p>
      <ChildInfoEditForm
        studentProfileId={c.profile_id}
        childUniqueId={c.child_unique_id ?? null}
        initial={{
          firstName: c.first_name ?? "",
          lastName: c.last_name ?? "",
          districtId: c.district_id ?? "",
          schoolId: c.school_id ?? "",
          gradeId: c.grade_id ?? "",
        }}
        cities={cities}
        schools={schools}
        grades={grades}
        dict={dict}
      />
    </section>
  );
}
