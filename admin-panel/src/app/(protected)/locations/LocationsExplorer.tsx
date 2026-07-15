"use client";

// Locations explorer — the merged Cities → Rayons → Schools master-detail
// (Round 21, item 7; first master-detail pattern in the admin panel).
//
//   Col 1 Şəhərlər (DB: districts)      — pick one → col 2 shows its rayons
//   Col 2 Rayonlar (DB: city_districts) — pick one → col 3 shows its schools;
//                                         plus the "Rayon təyin edilməyib"
//                                         review entry (NULL-rayon schools)
//   Col 3 Məktəblər (DB: schools)       — of the rayon / of the city directly
//                                         (no-rayon cities) / the review list
//
// Selection lives in the URL (?city=&district=) so refresh/back work and the
// SERVER page drives all data; this component only renders, filters locally
// (per-column search) and hosts the CRUD modals. Saves go through the existing
// guarded stay-mode actions (saveCity/saveDistrict/saveSchool → { ok: true });
// deletes go through deleteLocation with a getLocationDeleteImpact preview.
// All strings arrive translated via `labels` — no i18n logic here.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { CityForm } from "@/components/CityForm";
import { DistrictForm } from "@/components/DistrictForm";
import { SchoolForm } from "@/components/SchoolForm";
import type { SchoolDistrictOption } from "@/lib/admin/schools";
import {
  deleteLocation,
  getLocationDeleteImpact,
  type LocationKind,
} from "@/lib/admin/locations";
import {
  NEEDS_DISTRICT,
  type CityItem,
  type DistrictItem,
  type SchoolItem,
} from "./shared";

type ModalState =
  | { type: "city"; city?: CityItem }
  | { type: "district"; district?: DistrictItem }
  | { type: "school"; school?: SchoolItem }
  | { type: "delete"; kind: LocationKind; id: string; name: string }
  | null;

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function LocationsExplorer({
  labels,
  cities,
  districts,
  schools,
  selectedCityId,
  selectedDistrictId,
  needsCount,
  schoolDistrictOptions,
}: {
  labels: Record<string, string>;
  cities: CityItem[];
  /** Rayons of the selected city (all statuses). Empty when no city selected
   *  or the city has none. */
  districts: DistrictItem[];
  /** Schools of the current scope; null = no scope yet (prompt state). */
  schools: SchoolItem[] | null;
  selectedCityId: string | null;
  /** A rayon uuid, the "none" review sentinel, or null. */
  selectedDistrictId: string | null;
  /** NULL-rayon schools of the selected city (review list size). */
  needsCount: number;
  /** Active rayons of EVERY city (school-form city → rayon cascade). */
  schoolDistrictOptions: SchoolDistrictOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>(null);
  const [qCity, setQCity] = useState("");
  const [qDistrict, setQDistrict] = useState("");
  const [qSchool, setQSchool] = useState("");

  const l = useCallback((k: string) => labels[k] ?? k, [labels]);
  const fmt = useCallback(
    (k: string, n: number) => l(k).replace("{n}", String(n)),
    [l],
  );

  const selectedCity = useMemo(
    () => cities.find((c) => c.id === selectedCityId) ?? null,
    [cities, selectedCityId],
  );
  const selectedDistrict = useMemo(
    () =>
      selectedDistrictId && selectedDistrictId !== NEEDS_DISTRICT
        ? districts.find((d) => d.id === selectedDistrictId) ?? null
        : null,
    [districts, selectedDistrictId],
  );
  const cityHasDistricts = districts.length > 0;

  // ---- URL-driven selection ------------------------------------------------
  const go = useCallback(
    (city?: string | null, district?: string | null) => {
      const sp = new URLSearchParams();
      if (city) {
        sp.set("city", city);
        if (district) sp.set("district", district);
      }
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `/locations?${qs}` : "/locations", { scroll: false });
      });
    },
    [router],
  );

  const closeModal = useCallback(() => setModal(null), []);
  const onSaved = useCallback(() => {
    setModal(null);
    router.refresh();
  }, [router]);

  const onDeleted = useCallback(
    (kind: LocationKind, id: string) => {
      setModal(null);
      // Keep the URL honest when the deleted row was the current selection.
      if (kind === "city" && id === selectedCityId) go(null);
      else if (kind === "district" && id === selectedDistrictId)
        go(selectedCityId);
      else router.refresh();
    },
    [go, router, selectedCityId, selectedDistrictId],
  );

  // ---- Local (client-side) per-column search --------------------------------
  const norm = (s: string) => s.toLocaleLowerCase("az");
  const filteredCities = useMemo(() => {
    const q = norm(qCity.trim());
    return q ? cities.filter((c) => norm(c.name).includes(q)) : cities;
  }, [cities, qCity]);
  const filteredDistricts = useMemo(() => {
    const q = norm(qDistrict.trim());
    return q ? districts.filter((d) => norm(d.name).includes(q)) : districts;
  }, [districts, qDistrict]);
  const filteredSchools = useMemo(() => {
    if (!schools) return null;
    const q = norm(qSchool.trim());
    return q ? schools.filter((s) => norm(s.name).includes(q)) : schools;
  }, [schools, qSchool]);

  // ---- Dropdown options for the modal forms ---------------------------------
  const activeCityOptions = useMemo(
    () =>
      cities
        .filter((c) => c.status === "active")
        .map((c) => ({ value: c.id, label: c.name })),
    [cities],
  );
  // On edit, an inactive-but-assigned city must still render (existing rule).
  const cityOptionsWith = useCallback(
    (currentId?: string) => {
      if (currentId && !activeCityOptions.some((o) => o.value === currentId)) {
        const cur = cities.find((c) => c.id === currentId);
        if (cur) return [...activeCityOptions, { value: cur.id, label: cur.name }];
      }
      return activeCityOptions;
    },
    [activeCityOptions, cities],
  );
  // Same rule for an inactive-but-assigned rayon (it belongs to the selected
  // city, so its name is available in the column-2 data).
  const districtOptionsWith = useCallback(
    (currentId?: string | null) => {
      if (
        currentId &&
        !schoolDistrictOptions.some((o) => o.value === currentId)
      ) {
        const cur = districts.find((d) => d.id === currentId);
        if (cur)
          return [
            ...schoolDistrictOptions,
            { value: cur.id, cityId: cur.cityId, label: cur.name },
          ];
      }
      return schoolDistrictOptions;
    },
    [districts, schoolDistrictOptions],
  );

  // ---- Shared form label packs ----------------------------------------------
  const commonFormLabels = {
    status: l("field.status"),
    statusActive: l("loc.statusActive"),
    statusInactive: l("loc.statusInactive"),
    saving: l("manage.saving"),
    errGeneric: l("loc.errGeneric"),
  };

  const cityFormLabels = (isEdit: boolean) => ({
    ...commonFormLabels,
    name: l("loc.cityName"),
    submit: isEdit ? l("action.save") : l("action.create"),
    errMissingName: l("loc.errCityName"),
    errDuplicate: l("loc.errCityDuplicate"),
  });

  const districtFormLabels = (isEdit: boolean) => ({
    ...commonFormLabels,
    name: l("loc.districtName"),
    city: l("loc.city"),
    selectPlaceholder: l("manage.select"),
    submit: isEdit ? l("action.save") : l("action.create"),
    errMissingName: l("loc.errDistrictName"),
    errMissingCity: l("loc.errMissingCity"),
    errDuplicate: l("loc.errDistrictDuplicate"),
    errCityChange: l("loc.errCityChange"),
  });

  const schoolFormLabels = (isEdit: boolean) => ({
    ...commonFormLabels,
    name: l("loc.schoolName"),
    city: l("loc.city"),
    district: l("loc.district"),
    selectPlaceholder: l("manage.select"),
    submit: isEdit ? l("action.save") : l("action.create"),
    errMissingName: l("loc.errSchoolName"),
    errMissingCity: l("loc.errMissingCity"),
    errMissingDistrict: l("loc.errMissingDistrict"),
    isPrivate: l("loc.isPrivate"),
    isPrivateHint: l("loc.isPrivateHint"),
  });

  // ---- Row building blocks ---------------------------------------------------
  function RowActions({
    onEdit,
    onDelete,
  }: {
    onEdit: () => void;
    onDelete: () => void;
  }) {
    return (
      <span className="loc-row-actions">
        <button
          type="button"
          className="loc-icon-btn"
          title={l("action.edit")}
          aria-label={l("action.edit")}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <EditIcon />
        </button>
        <button
          type="button"
          className="loc-icon-btn danger"
          title={l("action.delete")}
          aria-label={l("action.delete")}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <TrashIcon />
        </button>
      </span>
    );
  }

  const inactivePill = (status: string) =>
    status === "inactive" ? (
      <span className="loc-pill loc-pill-muted">{l("loc.statusInactive")}</span>
    ) : null;

  // ---- Render ------------------------------------------------------------------
  return (
    <>
      <div className="loc-grid" data-pending={isPending ? "true" : undefined}>
        {/* ============ Column 1 — Cities ============ */}
        <section className="loc-col" aria-label={l("loc.cities")}>
          <header className="loc-col-head">
            <h2 className="loc-col-title">{l("loc.cities")}</h2>
            <span className="loc-col-count">{cities.length}</span>
            <button
              type="button"
              className="btn-ghost loc-col-add"
              onClick={() => setModal({ type: "city" })}
            >
              + {l("loc.addCity")}
            </button>
          </header>
          <div className="loc-search">
            <input
              type="search"
              value={qCity}
              onChange={(e) => setQCity(e.target.value)}
              placeholder={l("loc.searchCities")}
              aria-label={l("loc.searchCities")}
            />
          </div>
          <div className="loc-list">
            {cities.length === 0 && (
              <p className="loc-empty">{l("loc.noCities")}</p>
            )}
            {cities.length > 0 && filteredCities.length === 0 && (
              <p className="loc-empty">{l("flt.noMatches")}</p>
            )}
            {filteredCities.map((c) => (
              <div
                key={c.id}
                className={`loc-row${c.id === selectedCityId ? " selected" : ""}${
                  c.status === "inactive" ? " inactive" : ""
                }`}
              >
                <button
                  type="button"
                  className="loc-row-main"
                  onClick={() => go(c.id)}
                  aria-current={c.id === selectedCityId ? "true" : undefined}
                >
                  <span className="loc-row-name">{c.name}</span>
                  <span className="loc-row-meta">
                    <span>{fmt("loc.countDistricts", c.districtCount)}</span>
                    <span>·</span>
                    <span>{fmt("loc.countSchools", c.schoolCount)}</span>
                    {inactivePill(c.status)}
                  </span>
                </button>
                <RowActions
                  onEdit={() => setModal({ type: "city", city: c })}
                  onDelete={() =>
                    setModal({
                      type: "delete",
                      kind: "city",
                      id: c.id,
                      name: c.name,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* ============ Column 2 — Districts (rayons) ============ */}
        <section className="loc-col" aria-label={l("loc.districts")}>
          <header className="loc-col-head">
            <h2 className="loc-col-title">{l("loc.districts")}</h2>
            {selectedCity && (
              <span className="loc-col-count">{districts.length}</span>
            )}
            <button
              type="button"
              className="btn-ghost loc-col-add"
              disabled={!selectedCity}
              onClick={() => setModal({ type: "district" })}
            >
              + {l("loc.addDistrict")}
            </button>
          </header>
          {selectedCity && (
            <p className="loc-col-context muted">{selectedCity.name}</p>
          )}
          {selectedCity && cityHasDistricts && (
            <div className="loc-search">
              <input
                type="search"
                value={qDistrict}
                onChange={(e) => setQDistrict(e.target.value)}
                placeholder={l("loc.searchDistricts")}
                aria-label={l("loc.searchDistricts")}
              />
            </div>
          )}
          <div className="loc-list">
            {!selectedCity && (
              <p className="loc-empty">{l("loc.selectCityForDistricts")}</p>
            )}
            {selectedCity && !cityHasDistricts && (
              <p className="loc-empty">
                {l("loc.noDistrictsInCity")}
                <br />
                <span className="loc-empty-hint">{l("loc.noDistrictsHint")}</span>
              </p>
            )}
            {selectedCity &&
              cityHasDistricts &&
              filteredDistricts.length === 0 && (
                <p className="loc-empty">{l("flt.noMatches")}</p>
              )}
            {selectedCity &&
              cityHasDistricts &&
              (needsCount > 0 || selectedDistrictId === NEEDS_DISTRICT) && (
                <div
                  className={`loc-row review${
                    selectedDistrictId === NEEDS_DISTRICT ? " selected" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="loc-row-main"
                    onClick={() => go(selectedCity.id, NEEDS_DISTRICT)}
                    aria-current={
                      selectedDistrictId === NEEDS_DISTRICT ? "true" : undefined
                    }
                  >
                    <span className="loc-row-name">
                      {l("loc.needsDistrict")}
                    </span>
                    <span className="loc-row-meta">
                      <span className="loc-pill loc-pill-warn">
                        {fmt("loc.countSchools", needsCount)}
                      </span>
                      <span>{l("loc.needsDistrictHint")}</span>
                    </span>
                  </button>
                </div>
              )}
            {selectedCity &&
              filteredDistricts.map((d) => (
                <div
                  key={d.id}
                  className={`loc-row${
                    d.id === selectedDistrictId ? " selected" : ""
                  }${d.status === "inactive" ? " inactive" : ""}`}
                >
                  <button
                    type="button"
                    className="loc-row-main"
                    onClick={() => go(d.cityId, d.id)}
                    aria-current={
                      d.id === selectedDistrictId ? "true" : undefined
                    }
                  >
                    <span className="loc-row-name">{d.name}</span>
                    <span className="loc-row-meta">
                      <span>{fmt("loc.countSchools", d.schoolCount)}</span>
                      {inactivePill(d.status)}
                    </span>
                  </button>
                  <RowActions
                    onEdit={() => setModal({ type: "district", district: d })}
                    onDelete={() =>
                      setModal({
                        type: "delete",
                        kind: "district",
                        id: d.id,
                        name: d.name,
                      })
                    }
                  />
                </div>
              ))}
          </div>
        </section>

        {/* ============ Column 3 — Schools ============ */}
        <section className="loc-col" aria-label={l("loc.schools")}>
          <header className="loc-col-head">
            <h2 className="loc-col-title">{l("loc.schools")}</h2>
            {schools !== null && (
              <span className="loc-col-count">{schools.length}</span>
            )}
            <button
              type="button"
              className="btn-ghost loc-col-add"
              disabled={!selectedCity}
              onClick={() => setModal({ type: "school" })}
            >
              + {l("loc.addSchool")}
            </button>
          </header>
          {selectedCity && schools !== null && (
            <p className="loc-col-context muted">
              {selectedDistrictId === NEEDS_DISTRICT
                ? `${selectedCity.name} · ${l("loc.needsDistrict")}`
                : selectedDistrict
                  ? `${selectedCity.name} · ${selectedDistrict.name}`
                  : selectedCity.name}
            </p>
          )}
          {selectedDistrictId === NEEDS_DISTRICT && schools !== null && (
            <p className="loc-review-banner">{l("loc.reviewBanner")}</p>
          )}
          {schools !== null && schools.length > 0 && (
            <div className="loc-search">
              <input
                type="search"
                value={qSchool}
                onChange={(e) => setQSchool(e.target.value)}
                placeholder={l("loc.searchSchools")}
                aria-label={l("loc.searchSchools")}
              />
            </div>
          )}
          <div className="loc-list">
            {!selectedCity && (
              <p className="loc-empty">{l("loc.selectCityForSchools")}</p>
            )}
            {selectedCity && schools === null && (
              <p className="loc-empty">{l("loc.selectDistrictForSchools")}</p>
            )}
            {schools !== null && schools.length === 0 && (
              <p className="loc-empty">{l("loc.noSchools")}</p>
            )}
            {schools !== null &&
              schools.length > 0 &&
              filteredSchools !== null &&
              filteredSchools.length === 0 && (
                <p className="loc-empty">{l("flt.noMatches")}</p>
              )}
            {(filteredSchools ?? []).map((s) => (
              <div
                key={s.id}
                className={`loc-row${s.status === "inactive" ? " inactive" : ""}`}
              >
                <button
                  type="button"
                  className="loc-row-main"
                  onClick={() => setModal({ type: "school", school: s })}
                >
                  <span className="loc-row-name">{s.name}</span>
                  <span className="loc-row-meta">
                    <span
                      className={`loc-pill ${
                        s.isPrivate ? "loc-pill-private" : "loc-pill-public"
                      }`}
                    >
                      {s.isPrivate ? l("loc.private") : l("loc.public")}
                    </span>
                    {cityHasDistricts && s.cityDistrictId === null && (
                      <span className="loc-pill loc-pill-warn">
                        {l("loc.needsDistrict")}
                      </span>
                    )}
                    {inactivePill(s.status)}
                  </span>
                </button>
                <RowActions
                  onEdit={() => setModal({ type: "school", school: s })}
                  onDelete={() =>
                    setModal({
                      type: "delete",
                      kind: "school",
                      id: s.id,
                      name: s.name,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ============ City create/edit modal ============ */}
      <Modal
        isOpen={modal?.type === "city"}
        onClose={closeModal}
        title={
          modal?.type === "city" && modal.city
            ? l("loc.editCityTitle")
            : l("loc.addCityTitle")
        }
        closeLabel={l("modal.close")}
      >
        {modal?.type === "city" && (
          <CityForm
            id={modal.city?.id}
            defaultValues={
              modal.city
                ? { name: modal.city.name, status: modal.city.status }
                : undefined
            }
            labels={cityFormLabels(!!modal.city)}
            onSaved={onSaved}
          />
        )}
      </Modal>

      {/* ============ District create/edit modal ============ */}
      <Modal
        isOpen={modal?.type === "district"}
        onClose={closeModal}
        title={
          modal?.type === "district" && modal.district
            ? l("loc.editDistrictTitle")
            : l("loc.addDistrictTitle")
        }
        closeLabel={l("modal.close")}
      >
        {modal?.type === "district" && (
          <DistrictForm
            id={modal.district?.id}
            cityOptions={cityOptionsWith(
              modal.district?.cityId ?? selectedCityId ?? undefined,
            )}
            defaultValues={
              modal.district
                ? {
                    name: modal.district.name,
                    city_id: modal.district.cityId,
                    status: modal.district.status,
                  }
                : { city_id: selectedCityId ?? "" }
            }
            labels={districtFormLabels(!!modal.district)}
            onSaved={onSaved}
          />
        )}
      </Modal>

      {/* ============ School create/edit modal ============ */}
      <Modal
        isOpen={modal?.type === "school"}
        onClose={closeModal}
        title={
          modal?.type === "school" && modal.school
            ? l("loc.editSchoolTitle")
            : l("loc.addSchoolTitle")
        }
        closeLabel={l("modal.close")}
      >
        {modal?.type === "school" && (
          <SchoolForm
            id={modal.school?.id}
            cityOptions={cityOptionsWith(
              modal.school?.districtId ?? selectedCityId ?? undefined,
            )}
            districtOptions={districtOptionsWith(modal.school?.cityDistrictId)}
            defaultValues={
              modal.school
                ? {
                    name: modal.school.name,
                    district_id: modal.school.districtId,
                    city_district_id: modal.school.cityDistrictId,
                    status: modal.school.status,
                    is_private: modal.school.isPrivate,
                  }
                : {
                    district_id: selectedCityId ?? "",
                    city_district_id:
                      selectedDistrictId && selectedDistrictId !== NEEDS_DISTRICT
                        ? selectedDistrictId
                        : "",
                  }
            }
            labels={schoolFormLabels(!!modal.school)}
            onSaved={onSaved}
          />
        )}
      </Modal>

      {/* ============ Delete confirmation (impact preview) ============ */}
      {modal?.type === "delete" && (
        <DeleteConfirm
          kind={modal.kind}
          id={modal.id}
          name={modal.name}
          l={l}
          fmt={fmt}
          onClose={closeModal}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

// Delete confirmation modal: loads the impact counts on open (what cascades,
// what blocks, what detaches), disables confirmation when the DB is guaranteed
// to refuse (city with linked schools), and maps DB refusals to the friendly
// trilingual messages.
function DeleteConfirm({
  kind,
  id,
  name,
  l,
  fmt,
  onClose,
  onDeleted,
}: {
  kind: LocationKind;
  id: string;
  name: string;
  l: (k: string) => string;
  fmt: (k: string, n: number) => string;
  onClose: () => void;
  onDeleted: (kind: LocationKind, id: string) => void;
}) {
  const [impact, setImpact] = useState<{
    districts: number;
    schools: number;
    students: number;
  } | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getLocationDeleteImpact(kind, id)
      .then((res) => {
        if (!alive) return;
        if ("ok" in res) {
          setImpact({
            districts: res.districts,
            schools: res.schools,
            students: res.students,
          });
        } else {
          setImpactFailed(true);
        }
      })
      .catch(() => {
        if (alive) setImpactFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [kind, id]);

  // A city with linked schools is guaranteed to be refused by the DB
  // (schools.district_id is ON DELETE RESTRICT) — say so up front and do not
  // offer a doomed confirmation.
  const blocked = kind === "city" && impact !== null && impact.schools > 0;

  const title =
    kind === "city"
      ? l("loc.deleteCityTitle")
      : kind === "district"
        ? l("loc.deleteDistrictTitle")
        : l("loc.deleteSchoolTitle");

  const impactLines: string[] = [];
  if (impact) {
    if (kind === "city") {
      if (impact.districts > 0)
        impactLines.push(fmt("loc.impactCityDistricts", impact.districts));
      if (impact.schools > 0)
        impactLines.push(fmt("loc.impactCitySchools", impact.schools));
      if (impact.students > 0)
        impactLines.push(fmt("loc.impactCityStudents", impact.students));
    } else if (kind === "district") {
      if (impact.schools > 0)
        impactLines.push(fmt("loc.impactDistrictSchools", impact.schools));
    } else if (impact.students > 0) {
      impactLines.push(fmt("loc.impactSchoolStudents", impact.students));
    }
  }

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await deleteLocation(kind, id);
      if ("ok" in res) {
        onDeleted(kind, id);
        return;
      }
      setError(
        res.error === "cityInUse"
          ? l("loc.errCityInUse")
          : res.error === "districtInUse"
            ? l("loc.errDistrictInUse")
            : l("loc.errOp"),
      );
    } catch {
      setError(l("loc.errOp"));
    }
    setBusy(false);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      closeLabel={l("modal.close")}
      busy={busy}
    >
      <p className="loc-delete-question">
        {l("loc.deleteQuestion").replace("{name}", name)}
      </p>

      {impact === null && !impactFailed && (
        <p className="muted">{l("loc.impactLoading")}</p>
      )}
      {impact !== null && impactLines.length === 0 && (
        <p className="muted">{l("loc.impactNone")}</p>
      )}
      {impactLines.length > 0 && (
        <ul className="loc-impact">
          {impactLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {blocked && <p className="loc-impact-blocked">{l("loc.errCityInUse")}</p>}
      {!blocked && impact !== null && (
        <p className="loc-impact-note">{l("loc.deleteIrreversible")}</p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={onClose}
          disabled={busy}
        >
          {l("action.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={busy || blocked || (impact === null && !impactFailed)}
        >
          {busy ? l("manage.saving") : l("action.delete")}
        </button>
      </div>
    </Modal>
  );
}
