import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getSchool, listCityOptions } from "@/lib/admin/schools";
import { SchoolForm } from "@/components/SchoolForm";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "../../../cities/labels";

export default async function EditSchoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const lt = localStrings(await getLocale());

  const school = await getSchool(id);
  if (!school) notFound();
  const cityOptions = await listCityOptions(school.district_id);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("schools.editHeading")}</h1>
        <p className="muted">
          <Link href="/schools">
            ← {t("manage.back")} · {t("nav.schools")}
          </Link>
        </p>
      </div>

      <section className="card">
        <SchoolForm
          id={id}
          cityOptions={cityOptions}
          defaultValues={{
            name: school.name,
            district_id: school.district_id,
            status: school.status,
          }}
          labels={{
            name: lt("schools.schoolName"),
            city: lt("schools.city"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            selectPlaceholder: t("manage.select"),
            submit: t("action.save"),
            saving: t("manage.saving"),
            errMissingName: lt("schools.errMissingName"),
            errMissingCity: lt("schools.errMissingCity"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>
    </div>
  );
}
