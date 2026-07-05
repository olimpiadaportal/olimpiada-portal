import { requireAdmin } from "@/lib/admin/guards";
import { hasServiceRole } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listFreeAccessIntervals } from "@/lib/admin/freeAccess";
import { AccountCreateForm } from "@/components/AccountCreateForm";
import {
  CreateChildForm,
  type GradeOption,
  type SubjectOption,
  type CityOption,
  type SchoolOpt,
} from "@/components/CreateChildForm";
import {
  FreeAccessManager,
  type FreeAccessStrings,
} from "@/components/FreeAccessManager";
import { getT, getLocale } from "@/i18n/server";

// Admin-only Free-Access module. Round 12.1: this page is now the single
// admin workspace for the whole flow — create the parent, create the child
// (live parent search + City→School cascade), then schedule the free-access
// window — four clear sections on one page. The creation forms are the SAME
// components/server actions the Accounts section used (moved, not duplicated).
// All strings are resolved here (via getT) and passed down — clients never call t().
export default async function FreeAccessPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const serviceReady = hasServiceRole();
  const supabase = await createClient();

  const intervals = serviceReady ? await listFreeAccessIntervals() : [];

  // ---- Create-child form data (same sources as the parent Add-Child flow) ----
  // Grades feed the optional grade select; subjects are limited to ACTIVE
  // pricing per interval (mirrors the grant RPC); cities + schools feed the
  // mandatory City -> School cascade (schools ordered private-first + numeric).
  let childGrades: GradeOption[] = [];
  let childSubjects: SubjectOption[] = [];
  let childCities: CityOption[] = [];
  let childSchools: SchoolOpt[] = [];
  if (serviceReady) {
    const [gradesRes, pricingRes, citiesRes, schoolsRes] = await Promise.all([
      supabase.from("grades").select("id, name, level").order("level"),
      supabase
        .from("subjects_pricing")
        .select("subject_id, interval, subjects(name)")
        .eq("status", "active"),
      supabase.from("districts").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("schools")
        .select("id, name, district_id, is_private, school_number")
        .eq("status", "active")
        .order("is_private", { ascending: false })
        .order("school_number", { ascending: true, nullsFirst: false })
        .order("name"),
    ]);
    childGrades = ((gradesRes.data ?? []) as any[]).map((g) => ({
      id: g.id,
      name: g.name,
    }));
    childCities = ((citiesRes.data ?? []) as any[]).map((c) => ({
      id: c.id,
      name: c.name,
    }));
    childSchools = ((schoolsRes.data ?? []) as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      district_id: s.district_id,
      is_private: !!s.is_private,
    }));
    const bySubject = new Map<string, { name: string; intervals: Set<string> }>();
    for (const r of (pricingRes.data ?? []) as any[]) {
      const name = r.subjects?.name ?? "—";
      const entry = bySubject.get(r.subject_id) ?? {
        name,
        intervals: new Set<string>(),
      };
      entry.intervals.add(r.interval);
      bySubject.set(r.subject_id, entry);
    }
    childSubjects = Array.from(bySubject, ([id, s]) => ({
      id,
      name: s.name,
      intervals: Array.from(s.intervals),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  const createParentStrings = {
    open: t("accounts.create.open"),
    title: t("accounts.create.title"),
    firstName: t("accounts.create.firstName"),
    lastName: t("accounts.create.lastName"),
    email: t("accounts.create.email"),
    password: t("accounts.create.password"),
    passwordHint: t("accounts.create.passwordHint"),
    submit: t("accounts.create.submit"),
    submitting: t("accounts.create.submitting"),
    done: t("accounts.create.done"),
    cancel: t("action.cancel"),
    showPassword: t("auth.showPassword"),
    hidePassword: t("auth.hidePassword"),
  };

  const childCreateStrings = {
    open: t("accounts.child.create.open"),
    title: t("accounts.child.create.title"),
    intro: t("accounts.child.create.intro"),
    parent: t("accounts.child.create.parent"),
    parentSearch: t("accounts.child.create.parentSearch"),
    parentSearching: t("accounts.child.create.parentSearching"),
    parentEmpty: t("accounts.child.create.parentEmpty"),
    parentChildren: t("accounts.child.create.parentChildren"),
    parentClear: t("accounts.child.create.parentClear"),
    firstName: t("accounts.create.firstName"),
    lastName: t("accounts.create.lastName"),
    password: t("accounts.create.password"),
    passwordHint: t("accounts.create.passwordHint"),
    grade: t("accounts.child.create.grade"),
    gradeNone: t("accounts.child.create.gradeNone"),
    city: t("accounts.child.create.city"),
    cityChoose: t("accounts.child.create.cityChoose"),
    school: t("accounts.child.create.school"),
    schoolChoose: t("accounts.child.create.schoolChoose"),
    cityFirst: t("accounts.child.create.cityFirst"),
    privateSchools: t("accounts.child.create.privateSchools"),
    publicSchools: t("accounts.child.create.publicSchools"),
    grant: t("accounts.child.create.grant"),
    grantHelp: t("accounts.child.create.grantHelp"),
    interval: t("accounts.child.create.interval"),
    intervalWeek: t("accounts.child.interval.week"),
    intervalMonth: t("accounts.child.interval.month"),
    intervalYear: t("accounts.child.interval.year"),
    subjects: t("accounts.child.create.subjects"),
    subjectsNone: t("accounts.child.create.subjectsNone"),
    days: t("accounts.child.create.days"),
    daysHelp: t("accounts.child.create.daysHelp"),
    submit: t("accounts.child.create.submit"),
    submitting: t("accounts.child.create.submitting"),
    done: t("accounts.child.create.done"),
    idLabel: t("accounts.child.create.idLabel"),
    idPending: t("accounts.child.create.idPending"),
    bypassNote: t("accounts.child.create.bypassNote"),
    close: t("accounts.child.create.close"),
    cancel: t("action.cancel"),
    showPassword: t("auth.showPassword"),
    hidePassword: t("auth.hidePassword"),
  };

  const strings: FreeAccessStrings = {
    createHeading: t("freeAccess.createHeading"),
    listHeading: t("freeAccess.listHeading"),
    parent: t("freeAccess.parent"),
    parentSearch: t("freeAccess.parentSearch"),
    parentSearching: t("freeAccess.parentSearching"),
    parentEmpty: t("freeAccess.parentEmpty"),
    parentChildren: t("freeAccess.parentChildren"),
    parentClear: t("freeAccess.parentClear"),
    child: t("freeAccess.child"),
    childAll: t("freeAccess.childAll"),
    childLoading: t("freeAccess.childLoading"),
    start: t("freeAccess.start"),
    end: t("freeAccess.end"),
    note: t("freeAccess.note"),
    notePlaceholder: t("freeAccess.notePlaceholder"),
    create: t("freeAccess.create"),
    creating: t("freeAccess.creating"),
    created: t("freeAccess.created"),
    scheduleAnother: t("freeAccess.scheduleAnother"),
    deactivate: t("freeAccess.deactivate"),
    deactivateConfirm: t("freeAccess.deactivateConfirm"),
    endBeforeStart: t("freeAccess.endBeforeStart"),
    target: t("freeAccess.target"),
    window: t("freeAccess.window"),
    statusHeading: t("freeAccess.statusHeading"),
    statusActive: t("freeAccess.status.active"),
    statusScheduled: t("freeAccess.status.scheduled"),
    statusExpired: t("freeAccess.status.expired"),
    statusInactive: t("freeAccess.status.inactive"),
    none: t("freeAccess.none"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("freeAccess.title")}</h1>
        <p className="muted">{t("freeAccess.subtitle")}</p>
      </div>

      {!serviceReady ? (
        <section className="card">
          <p className="form-error">{t("accounts.reset.noServiceKey")}</p>
        </section>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 20 }}>
            <h3>{t("freeAccess.createParentHeading")}</h3>
            <p className="muted">{t("freeAccess.createParentHelp")}</p>
            <AccountCreateForm strings={createParentStrings} />
          </section>

          <section className="card" style={{ marginBottom: 20 }}>
            <h3>{t("freeAccess.createChildHeading")}</h3>
            <p className="muted">{t("freeAccess.createChildHelp")}</p>
            <CreateChildForm
              grades={childGrades}
              subjects={childSubjects}
              cities={childCities}
              schools={childSchools}
              strings={childCreateStrings}
            />
          </section>

          <FreeAccessManager
            intervals={intervals}
            locale={locale}
            strings={strings}
          />
        </>
      )}
    </div>
  );
}
