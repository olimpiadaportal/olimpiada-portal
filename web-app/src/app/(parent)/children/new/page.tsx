import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getParentFreeAccess } from "@/lib/freeAccess";
import { parsePlanParams } from "@/lib/pricingConfigurator";
import { sortSubjectsByLabel } from "@/lib/subjectLabel";
import { AddChildWizard } from "@/components/AddChildWizard";
import { TAUGHT_SUBJECTS_RPC, taughtSubjectSet } from "@/lib/gradeSubjects";

// The inline trial picker's strings (FreeTrialActivation). The hero speaks the
// onboarding offer itself — "Choose 2 subjects and enjoy 24 hours of FREE
// access!" — rather than the subscribe page's wording.
const TRIAL_KEYS = [
  "trial.hero.duration", "trial.hero.p1", "trial.hero.p2", "trial.hero.p3", "trial.hero.p4",
  "trial.cta.activate", "trial.cta.pending",
  "trial.pick.title", "trial.pick.hint", "trial.pick.cap", "trial.pick.selected",
  "trial.pick.locked", "trial.pick.aria.select", "trial.pick.aria.selected", "trial.pick.done",
  "trial.summary.title", "trial.summary.count", "trial.summary.endsAt",
  "trial.confirm.title", "trial.confirm.body", "trial.confirm.ok", "trial.confirm.cancel",
  "trial.done.title", "trial.done.body", "trial.done.next",
  "trial.status.endsIn", "trial.time.h", "trial.time.m", "trial.time.s",
  "trial.expired.title", "trial.note.unrated",
];

// All i18n keys the (client) wizard needs, resolved server-side into a dict.
const KEYS = [
  // info step
  "parent.child.first", "parent.child.last", "parent.child.password",
  "parent.child.passwordHint", "parent.child.submitting",
  "addchild.field.city", "addchild.field.school", "addchild.field.grade",
  "addchild.field.selectCity", "addchild.field.selectSchool",
  "addchild.field.selectGrade", "addchild.field.cityFirst",
  "addchild.field.privateSchools", "addchild.field.publicSchools",
  // Round 21: intra-city district (rayon) cascade between City and School.
  "addchild.field.district", "addchild.field.selectDistrict",
  "addchild.field.noDistricts",
  "auth.showPassword", "auth.hidePassword",
  // step nav + steps
  "addchild.step.info", "addchild.step.trial", "addchild.step.done",
  "addchild.next", "addchild.back", "addchild.createChild",
  // TRIAL-FIRST onboarding (owner, 2026-10-10): the trial step, its skip, and
  // the done step's two outcomes. Subscribing is not part of onboarding any
  // more; the done step links to Manage Subscription instead.
  "addchild.trial.skip", "addchild.trial.started", "addchild.trial.subjects",
  "addchild.created", "addchild.manageSubscription",
  "trial.status.endsIn", "trial.time.h", "trial.time.m", "trial.time.s",
  "trial.expired.title",
  "pay.idRevealed",
  // done
  "parent.child.idNote", "parent.dash.title",
  // R11 payment modes (giveaway / payments-off) + R-audit H8 free-access window
  "addchild.giveawayGranted", "addchild.freeAccessGranted", "gate.paymentsOff",
  // validation-error keys returned by createChild / validateChildInfo:
  "auth.child.err.firstNameRequired", "auth.child.err.lastNameRequired",
  "auth.child.err.passwordTooShort", "auth.child.err.passwordWeak",
  "auth.child.err.passwordEqualsId",
  "auth.child.err.createFailed",
  "addchild.err.cityRequired", "addchild.err.schoolRequired",
  "addchild.err.gradeRequired", "addchild.err.districtRequired",
  "sub.err.invalid",
  // avatar section (preset boy/girl or photo upload; default = initials)
  "addchild.avatar.title", "addchild.avatar.hint", "addchild.avatar.default",
  "addchild.avatar.boy", "addchild.avatar.girl", "addchild.avatar.upload",
  "addchild.avatar.replace", "addchild.avatar.removePhoto",
  "addchild.avatar.photoSelected", "addchild.avatar.requirements",
  // The REQUIRED gender field (ChildGenderField, mandatory since 2026-09-16):
  // its labels, the placeholder, and BOTH refusal keys — genderRequired for an
  // unanswered field, genderInvalid for a forged value.
  //
  // `addchild.gender.unspecified` and `field.optional` are RETIRED FROM THIS
  // CONTROL and stay listed for the same reason `pay.payNow` above does: a
  // dictionary that drops a key a cached bundle still asks for renders the key
  // itself on a parent's screen.
  "addchild.field.gender", "addchild.field.genderNone",
  "addchild.field.genderHint", "addchild.gender.female",
  "addchild.gender.male", "addchild.gender.unspecified",
  "addchild.err.genderRequired", "addchild.err.genderInvalid", "field.optional",
  // ...and the warning shown when the child was created but that answer was
  // not stored — a SUCCESS the parent must still act on.
  "addchild.warn.genderNotSaved",
];

export default async function NewChildPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    subjects?: string | string[];
    interval?: string | string[];
    flow?: string | string[];
  }>;
}) {
  await requireParent();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const search = await searchParams;

  if (search.flow !== "create" && !search.plan && !search.subjects) {
    return (
      <section className="page stack" style={{ gap: 20 }}>
        <h1>{t("link.choice.title")}</h1>
        <div className="grid2">
          <div className="card stack" style={{ gap: 12 }}>
            <h2>{t("link.choice.create")}</h2>
            <p className="muted">{t("link.choice.createBody")}</p>
            <Link className="btn" href="/children/new?flow=create">{t("link.choice.create")}</Link>
          </div>
          <div className="card stack" style={{ gap: 12 }}>
            <h2>{t("link.choice.existing")}</h2>
            <p className="muted">{t("link.choice.existingBody")}</p>
            <Link className="btn secondary" href="/children/link">{t("link.choice.existing")}</Link>
          </div>
        </div>
      </section>
    );
  }

  // R11: the payment mode decides which wizard steps exist (server-resolved;
  // the wizard client only receives the string, never the flags themselves).
  const { mode: paymentMode } = await getPaymentModeInfo();
  // H8: an ACTIVE free-access window for this parent takes the same free path
  // as the giveaway (no plan/payment steps; the server action re-verifies that
  // a free window really covers the child before allocating the login ID).
  const { active: freeAccessActive } = await getParentFreeAccess();

  // Catalogs: cities (active districts), rayons (city_districts), schools
  // (active), grades. NAMING: `districts` = the CITIES table (historic naming);
  // `city_districts` = the real intra-city rayons (Round 21 cascade).
  const [
    { data: cityRows },
    { data: cityDistrictRows },
    { data: schoolRows },
    { data: gradeRows },
    { data: pricing },
  ] = await Promise.all([
    supabase.from("districts").select("id, name").eq("status", "active").order("name"),
    supabase
      .from("city_districts")
      .select("id, name, city_id")
      .eq("status", "active")
      .order("name"),
    // Round 12: schools sort PRIVATE first, then by numeric school_number
    // ascending (2 before 10), unnumbered last, then name.
    supabase
      .from("schools")
      .select("id, name, district_id, city_district_id, is_private, school_number")
      .eq("status", "active")
      .order("is_private", { ascending: false })
      .order("school_number", { ascending: true, nullsFirst: false })
      .order("name"),
    supabase.from("grades").select("id, level, name").order("level", { ascending: true }),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, subjects(code, name, status)")
      .eq("status", "active"),
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

  // Collapse the pricing rows into per-subject { id, code, name, prices } (same
  // shape the subscribe flow uses). `code` drives the locale-aware label
  // (subj.<code>) in the wizard; `name` stays the DB fallback.
  const map = new Map<
    string,
    {
      id: string;
      code: string | null;
      name: string;
      prices: Record<string, number>;
      active: boolean;
    }
  >();
  for (const row of (pricing ?? []) as any[]) {
    const sid = row.subject_id;
    if (!map.has(sid)) {
      map.set(sid, {
        id: sid,
        code: row.subjects?.code ?? null,
        name: row.subjects?.name ?? "—",
        prices: {},
        active: row.subjects?.status === "active",
      });
    }
    map.get(sid)!.prices[row.interval] = Number(row.price_amount);
  }
  // Round 50: an ARCHIVED subject keeps its pricing rows, and `.eq("status",
  // "active")` above filters the PRICING row, not the subject — so an archived
  // subject with a live price used to stay tickable here while /services
  // correctly dropped it. Filter it out so the two catalogs agree (this is also
  // what the hand-off comment below has always claimed).
  //
  // ORDERED BY WHAT THE PARENT READS. This used to sort on `subjects.name` —
  // the bulk-import match key migration 171 FROZE — while the wizard renders
  // subjectLabel(), so the order matched the visible labels only until the
  // first rename, and never matched them at all for an English or Russian
  // parent (that column holds one Azerbaijani string for every reader). Same
  // helper, same reasoning as the subscribe screen.
  //
  // Resolving server-side is safe here precisely because the wizard is not
  // free to disagree: it re-resolves the identical string from the root
  // layout's client dictionary, which publishes the same `subj.db.<code>` keys
  // getT() does. The label is then dropped again — leaving it on would
  // serialize a string into the page that the client already computes.
  const subjects = sortSubjectsByLabel(
    t,
    locale,
    Array.from(map.values())
      .filter((sub) => sub.active)
      .map(({ active: _active, ...rest }) => rest),
  ).map(({ label: _label, ...rest }) => rest);

  // Hand-off from the public /services configurator:
  // `?plan=<uuid>:<cycle>,…` (migration 109), with the older
  // `?subjects=…&interval=…` pair still accepted. This is UNTRUSTED input —
  // validated here against the catalog the wizard actually offers (UUID shape,
  // de-duplicated, capped at 20, unknown/archived/unpriced ids dropped
  // silently, unknown interval falls back to monthly). It only PRESELECTS the
  // wizard; subscribeChild re-validates every id, re-checks ownership and
  // re-prices server-side, so a forged link can never buy anything.
  const { plan: initialPlan } = parsePlanParams(search, subjects);

  // Which subjects each grade studies (migration 155) — the trial step offers
  // only those for the grade the parent picks on the info step. One read per
  // grade, in parallel; a failed read is `null` = "do not filter".
  const taughtEntries = await Promise.all(
    grades.map(async (g) => {
      const { data, error } = await supabase.rpc(TAUGHT_SUBJECTS_RPC, { p_grade: g.id });
      const set = taughtSubjectSet(data, error);
      return [g.id, set ? [...set] : null] as const;
    }),
  );
  const taughtByGrade = Object.fromEntries(taughtEntries);

  const trialDict: Record<string, string> = {};
  for (const k of TRIAL_KEYS) trialDict[k] = t(k);
  trialDict["trial.hero.title"] = t("addchild.trial.title");
  trialDict["trial.hero.body"] = t("addchild.trial.body");

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  // R11: .wiz-page centers the whole flow (heading row + wizard share one
  // centered column) — no inline max-width so the plan-card step gets room.
  return (
    <section className="prose wiz-page">
      <div className="wiz-head">
        <h1>{t("parent.child.title")}</h1>
        <Link className="btn-ghost" href="/dashboard">
          {t("parent.dash.title")}
        </Link>
      </div>
      <p className="muted">{t("parent.child.intro")}</p>
      <AddChildWizard
        cities={cities}
        cityDistricts={cityDistricts}
        schools={schools}
        grades={grades}
        subjects={subjects.map(({ id, code, name }) => ({ id, code, name }))}
        taughtByGrade={taughtByGrade}
        dict={dict}
        trialDict={trialDict}
        paymentMode={paymentMode}
        freeAccessActive={freeAccessActive}
        initialTrialSubjectIds={initialPlan.map((p) => p.subjectId)}
      />
    </section>
  );
}
