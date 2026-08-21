import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getParentFreeAccess } from "@/lib/freeAccess";
import { parsePlanParams } from "@/lib/pricingConfigurator";
import { AddChildWizard } from "@/components/AddChildWizard";

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
  "addchild.step.info", "addchild.step.subjects", "addchild.step.plan",
  "addchild.step.payment", "addchild.step.done",
  "addchild.next", "addchild.back", "addchild.createChild",
  // subjects + plan (reused subscribe keys)
  "sub.subjects", "sub.noSubjectsAvailable", "sub.interval",
  "pricing.weekly", "pricing.monthly", "pricing.yearly",
  // R11 plan cards — subscription-page parity copy. The popular-badge chain
  // mirrors the Subscription page; missing keys resolve to themselves and the
  // wizard's pick() skips them.
  "pricing2.badge.popular", "pricing2.popular", "pricing2.mostPopular",
  "billing.popular",
  "billing.perWeek", "billing.perMonth", "billing.perYear",
  // Migration 109 — per-subject cycle cards + the grouped summary.
  "plan.cycle", "plan.cycleAria", "plan.cycleChangedAria",
  "plan.removeSubject",
  "plan.group.weekly", "plan.group.monthly", "plan.group.yearly",
  "plan.group.subtotal", "plan.dueToday", "plan.dueTodayNote",
  "plan.renewals", "plan.renewalLine.weekly", "plan.renewalLine.monthly",
  "plan.renewalLine.yearly", "plan.mixedNote", "plan.fromPrice",
  "plan.removeAria", "plan.perSubjectHint",
  "cfg.add", "cfg.addAria", "cfg.allAdded", "cfg.unpriced", "cfg.emptySelection",
  "cfg.warnAllUnpriced", "cfg.warnSomeUnpriced", "sub.trial", "sub.days",
  "sub.discount",
  "pricing.plan.weekly.note", "pricing.plan.monthly.note",
  "pricing.plan.yearly.note",
  // payment confirmation (step 4) + the result
  // Migration 126: `pay.continue` / `pay.confirmNoCharge` are the honest
  // labels — the button says "continue to payment" only when the server quote
  // says something is due — and `sub.trialNoChargeToday` explains a zero.
  // `pay.payNow` stays listed: the wizard no longer renders it, but a dictionary
  // that drops a key a cached bundle still asks for renders the key itself.
  "pay.title", "pay.note", "pay.payNow", "pay.continue", "pay.confirmNoCharge",
  "sub.trialNoChargeToday",
  "pay.processing", "pay.success",
  "pay.idRevealed", "pay.subtotal", "pay.discount", "pay.total",
  // done
  "parent.child.idNote", "parent.dash.title",
  // R11 payment modes (giveaway / payments-off) + R-audit H8 free-access window
  "addchild.giveawayGranted", "addchild.freeAccessGranted", "gate.paymentsOff",
  // validation-error keys returned by createChild / validateChildInfo:
  "auth.child.err.firstNameRequired", "auth.child.err.lastNameRequired",
  "auth.child.err.passwordTooShort", "auth.child.err.passwordEqualsId",
  "auth.child.err.createFailed",
  "addchild.err.cityRequired", "addchild.err.schoolRequired",
  "addchild.err.gradeRequired", "addchild.err.districtRequired",
  "sub.err.invalid",
  // avatar section (preset boy/girl or photo upload; default = initials)
  "addchild.avatar.title", "addchild.avatar.hint", "addchild.avatar.default",
  "addchild.avatar.boy", "addchild.avatar.girl", "addchild.avatar.upload",
  "addchild.avatar.replace", "addchild.avatar.removePhoto",
  "addchild.avatar.photoSelected", "addchild.avatar.requirements",
];

export default async function NewChildPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    subjects?: string | string[];
    interval?: string | string[];
  }>;
}) {
  await requireParent();
  const t = await getT();
  const supabase = await createClient();
  const search = await searchParams;

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
  // Sorting matches lib/pricing.ts's "az" collation so the wizard lists
  // subjects in the same order the configurator did.
  const subjects = Array.from(map.values())
    .filter((sub) => sub.active)
    .map(({ active: _active, ...rest }) => rest)
    .sort((a, b) => a.name.localeCompare(b.name, "az"));

  // Hand-off from the public /services configurator:
  // `?plan=<uuid>:<cycle>,…` (migration 109), with the older
  // `?subjects=…&interval=…` pair still accepted. This is UNTRUSTED input —
  // validated here against the catalog the wizard actually offers (UUID shape,
  // de-duplicated, capped at 20, unknown/archived/unpriced ids dropped
  // silently, unknown interval falls back to monthly). It only PRESELECTS the
  // wizard; subscribeChild re-validates every id, re-checks ownership and
  // re-prices server-side, so a forged link can never buy anything.
  const { plan: initialPlan } = parsePlanParams(search, subjects);

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
        subjects={subjects}
        dict={dict}
        paymentMode={paymentMode}
        freeAccessActive={freeAccessActive}
        initialPlan={initialPlan}
      />
    </section>
  );
}
