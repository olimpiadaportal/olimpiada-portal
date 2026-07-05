import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
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
  "pricing.plan.weekly.note", "pricing.plan.monthly.note",
  "pricing.plan.yearly.note",
  // payment (demo)
  "pay.title", "pay.demoBadge", "pay.note", "pay.cardName", "pay.cardNumber",
  "pay.expiry", "pay.cvc", "pay.payNow", "pay.processing", "pay.success",
  "pay.idRevealed", "pay.subtotal", "pay.discount", "pay.total",
  // done
  "parent.child.idNote", "parent.dash.title",
  // R11 payment modes (giveaway / payments-off)
  "addchild.giveawayGranted", "gate.paymentsOff",
  // validation-error keys returned by createChild / validateChildInfo:
  "auth.child.err.firstNameRequired", "auth.child.err.lastNameRequired",
  "auth.child.err.passwordTooShort", "auth.child.err.passwordEqualsId",
  "auth.child.err.createFailed",
  "addchild.err.cityRequired", "addchild.err.schoolRequired",
  "addchild.err.gradeRequired",
  "sub.err.invalid",
];

export default async function NewChildPage() {
  await requireParent();
  const t = await getT();
  const supabase = await createClient();

  // R11: the payment mode decides which wizard steps exist (server-resolved;
  // the wizard client only receives the string, never the flags themselves).
  const { mode: paymentMode } = await getPaymentModeInfo();

  // Catalogs: cities (active districts), schools (active), grades.
  const [{ data: cityRows }, { data: schoolRows }, { data: gradeRows }, { data: pricing }] =
    await Promise.all([
      supabase.from("districts").select("id, name").eq("status", "active").order("name"),
      // Round 12: schools sort PRIVATE first, then by numeric school_number
      // ascending (2 before 10), unnumbered last, then name.
      supabase
        .from("schools")
        .select("id, name, district_id, is_private, school_number")
        .eq("status", "active")
        .order("is_private", { ascending: false })
        .order("school_number", { ascending: true, nullsFirst: false })
        .order("name"),
      supabase.from("grades").select("id, level, name").order("level", { ascending: true }),
      supabase
        .from("subjects_pricing")
        .select("subject_id, interval, price_amount, subjects(name)")
        .eq("status", "active"),
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

  // Collapse the pricing rows into per-subject { id, name, prices } (same shape
  // the subscribe flow uses).
  const map = new Map<string, { id: string; name: string; prices: Record<string, number> }>();
  for (const row of (pricing ?? []) as any[]) {
    const sid = row.subject_id;
    if (!map.has(sid)) map.set(sid, { id: sid, name: row.subjects?.name ?? "—", prices: {} });
    map.get(sid)!.prices[row.interval] = Number(row.price_amount);
  }
  const subjects = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

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
        schools={schools}
        grades={grades}
        subjects={subjects}
        dict={dict}
        paymentMode={paymentMode}
      />
    </section>
  );
}
