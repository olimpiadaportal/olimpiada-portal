import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { listSchoolDistrictOptions } from "@/lib/admin/schools";
import { getT, getLocale } from "@/i18n/server";
import { allStrings, localStrings } from "./labels";
import { LocationsExplorer } from "./LocationsExplorer";
import {
  NEEDS_DISTRICT,
  type CityItem,
  type DistrictItem,
  type SchoolItem,
} from "./shared";

// Yerlər / Locations — the merged Cities → Rayons → Schools admin screen
// (Round 21, item 7; replaces the separate /cities, /districts and /schools
// pages). Selection lives in the URL (?city=&district=) so refresh/back work
// and this SERVER component drives all data:
//   * col 1: every city (DB districts) with rayon + school counts;
//   * col 2: the selected city's rayons (DB city_districts) with school counts
//     + the needs-district review count (NULL-rayon schools of that city);
//   * col 3: schools of the selected rayon, of the city directly (cities
//     without rayons), or the review list (?district=none).
// Mutations go through the guarded stay-mode lib actions (saveCity /
// saveDistrict / saveSchool / deleteLocation) — this page only reads.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams (selection) ---------------------------------
  const cityRaw = first(sp, "city").trim();
  const cityParam = UUID_RE.test(cityRaw) ? cityRaw : "";
  const districtRaw = first(sp, "district").trim();
  const districtParam =
    districtRaw === NEEDS_DISTRICT || UUID_RE.test(districtRaw)
      ? districtRaw
      : "";

  // ---- Column 1: all cities with rayon + school counts ---------------------
  const { data: cityRows } = await supabase
    .from("districts")
    .select("id, name, status, city_districts(count), schools(count)")
    .order("name");
  const cities: CityItem[] = ((cityRows ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: String(r.name),
    status: String(r.status),
    districtCount: r.city_districts?.[0]?.count ?? 0,
    schoolCount: r.schools?.[0]?.count ?? 0,
  }));

  const selectedCity = cities.find((c) => c.id === cityParam) ?? null;

  // ---- Column 2: the selected city's rayons (all statuses) -----------------
  let districts: DistrictItem[] = [];
  if (selectedCity) {
    const { data } = await supabase
      .from("city_districts")
      .select("id, city_id, name, status, schools(count)")
      .eq("city_id", selectedCity.id)
      .order("name");
    districts = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      cityId: r.city_id as string,
      name: String(r.name),
      status: String(r.status),
      schoolCount: r.schools?.[0]?.count ?? 0,
    }));
  }
  const cityHasDistricts = districts.length > 0;

  // Validate the district selection against the selected city.
  let selectedDistrictId: string | null = null;
  if (selectedCity && districtParam) {
    if (districtParam === NEEDS_DISTRICT) {
      if (cityHasDistricts) selectedDistrictId = NEEDS_DISTRICT;
    } else if (districts.some((d) => d.id === districtParam)) {
      selectedDistrictId = districtParam;
    }
  }

  // Needs-district review count for the selected city (NULL-rayon schools of a
  // city that has rayons — the manual backfill list).
  let needsCount = 0;
  if (selectedCity && cityHasDistricts) {
    const { count } = await supabase
      .from("schools")
      .select("id", { count: "exact", head: true })
      .eq("district_id", selectedCity.id)
      .is("city_district_id", null);
    needsCount = count ?? 0;
  }

  // ---- Column 3: schools of the current scope ------------------------------
  // null = prompt state (no city, or the city has rayons but none is picked).
  // Round 12 order: private first, numeric school_number asc (nulls last), name.
  let schools: SchoolItem[] | null = null;
  const loadSchools = async (
    apply: (qb: any) => any,
  ): Promise<SchoolItem[]> => {
    const base = supabase
      .from("schools")
      .select("id, name, status, is_private, district_id, city_district_id");
    const { data } = await apply(base)
      .order("is_private", { ascending: false })
      .order("school_number", { ascending: true, nullsFirst: false })
      .order("name");
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: String(r.name),
      status: String(r.status),
      isPrivate: !!r.is_private,
      districtId: r.district_id as string,
      cityDistrictId: (r.city_district_id as string | null) ?? null,
    }));
  };
  if (selectedCity) {
    if (!cityHasDistricts) {
      // No rayons: schools attach directly to the city.
      schools = await loadSchools((qb) => qb.eq("district_id", selectedCity.id));
    } else if (selectedDistrictId === NEEDS_DISTRICT) {
      schools = await loadSchools((qb) =>
        qb.eq("district_id", selectedCity.id).is("city_district_id", null),
      );
    } else if (selectedDistrictId) {
      schools = await loadSchools((qb) =>
        qb.eq("city_district_id", selectedDistrictId),
      );
    }
  }

  // Active rayons of every city — the school form's city → rayon cascade.
  const schoolDistrictOptions = await listSchoolDistrictOptions();

  // ---- Labels for the client explorer (local trilingual + shared t()) ------
  const labels: Record<string, string> = { ...allStrings(locale) };
  for (const key of [
    "field.status",
    "action.create",
    "action.save",
    "action.edit",
    "action.delete",
    "action.cancel",
    "manage.saving",
    "manage.select",
    "flt.noMatches",
    "modal.close",
  ]) {
    labels[key] = t(key);
  }

  return (
    <div className="page locations-page">
      <div className="page-head">
        <h1>{lt("nav.locations")}</h1>
        <p className="muted">{lt("loc.subtitle")}</p>
      </div>

      <LocationsExplorer
        labels={labels}
        cities={cities}
        districts={districts}
        schools={schools}
        selectedCityId={selectedCity?.id ?? null}
        selectedDistrictId={selectedDistrictId}
        needsCount={needsCount}
        schoolDistrictOptions={schoolDistrictOptions}
      />
    </div>
  );
}
