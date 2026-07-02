import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getCity } from "@/lib/admin/cities";
import { CityForm } from "@/components/CityForm";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "../../labels";

export default async function EditCityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const lt = localStrings(await getLocale());
  const city = await getCity(id);
  if (!city) notFound();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("cities.editHeading")}</h1>
        <p className="muted">
          <Link href="/cities">
            ← {t("manage.back")} · {t("nav.cities")}
          </Link>
        </p>
      </div>

      <section className="card">
        <CityForm
          id={id}
          defaultValues={{
            name: city.name,
            status: city.status,
          }}
          labels={{
            name: lt("cities.cityName"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            submit: t("action.save"),
            saving: t("manage.saving"),
            errMissingName: lt("cities.errMissingName"),
            errDuplicate: lt("cities.errDuplicate"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>
    </div>
  );
}
