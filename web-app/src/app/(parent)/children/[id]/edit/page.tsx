import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { resolveChildAvatarUrl } from "@/lib/childAvatar";
import { ChildInfoEditForm } from "@/components/ChildInfoEditForm";

// All i18n keys the (client) edit form needs, resolved server-side into a dict.
const KEYS = [
  "parent.child.first", "parent.child.last",
  "addchild.field.city", "addchild.field.school", "addchild.field.grade",
  "addchild.field.selectCity", "addchild.field.selectSchool",
  "addchild.field.selectGrade", "addchild.field.cityFirst",
  "addchild.field.privateSchools", "addchild.field.publicSchools",
  // Round 21: intra-city district (rayon) cascade between City and School.
  "addchild.field.district", "addchild.field.selectDistrict",
  "addchild.field.noDistricts",
  "parent.child.idLabel", "parent.dash.idPending",
  "childedit.save", "childedit.saving", "childedit.saved", "childedit.back",
  "childedit.internalId", "childedit.idNote",
  // validation-error keys the action may return:
  "auth.child.err.firstNameRequired", "auth.child.err.lastNameRequired",
  "auth.child.err.nameTooLong",
  "addchild.err.cityRequired", "addchild.err.schoolRequired",
  "addchild.err.gradeRequired", "addchild.err.districtRequired",
  "childedit.err.generic", "childedit.err.notYourChild",
  // avatar section (preset boy/girl or photo upload; default = initials)
  "addchild.avatar.title", "addchild.avatar.hint", "addchild.avatar.default",
  "addchild.avatar.boy", "addchild.avatar.girl", "addchild.avatar.upload",
  "addchild.avatar.replace", "addchild.avatar.removePhoto",
  "addchild.avatar.photoSelected", "addchild.avatar.requirements",
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
        "grade_id, district_id, city_district_id, school_id, created_by_parent_profile_id, " +
        "avatar_kind, avatar_key, avatar_media_path",
    )
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) {
    notFound();
  }
  const c = child as any;

  // Catalogs: cities (active districts), rayons (city_districts), schools
  // (active, private-first), grades — same data-loading pattern the Add-Child
  // flow uses. NAMING: `districts` = cities; `city_districts` = the rayons.
  const [{ data: cityRows }, { data: cityDistrictRows }, { data: schoolRows }, { data: gradeRows }] =
    await Promise.all([
      supabase.from("districts").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("city_districts")
        .select("id, name, city_id")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("schools")
        .select("id, name, district_id, city_district_id, is_private, school_number")
        .eq("status", "active")
        .order("is_private", { ascending: false })
        .order("school_number", { ascending: true, nullsFirst: false })
        .order("name"),
      supabase.from("grades").select("id, level, name").order("level", { ascending: true }),
    ]);

  const cities = (cityRows ?? []) as { id: string; name: string }[];
  const cityDistricts = (cityDistrictRows ?? []) as {
    id: string;
    name: string;
    city_id: string;
  }[];
  const schools = (schoolRows ?? []) as {
    id: string;
    name: string;
    district_id: string | null;
    city_district_id: string | null;
    is_private: boolean;
    school_number: number | null;
  }[];
  const grades = (gradeRows ?? []) as { id: string; level: number; name: string }[];

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  const childName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();

  // Existing PHOTO avatar → a short-lived signed URL via the parent's own
  // session client (the private bucket's RLS covers the linked family).
  const avatarPhotoUrl =
    c.avatar_kind === "photo"
      ? await resolveChildAvatarUrl(supabase, c)
      : null;

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
          cityDistrictId: c.city_district_id ?? "",
          schoolId: c.school_id ?? "",
          gradeId: c.grade_id ?? "",
        }}
        initialAvatar={{
          kind: c.avatar_kind ?? "preset",
          key: c.avatar_key ?? null,
          photoUrl: avatarPhotoUrl,
        }}
        cities={cities}
        cityDistricts={cityDistricts}
        schools={schools}
        grades={grades}
        dict={dict}
      />
    </section>
  );
}
