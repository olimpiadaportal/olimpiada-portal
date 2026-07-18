import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "./labels";
import { PriceCell } from "./PriceCell";
import { PRICE_INTERVALS, type PriceInterval } from "./shared";

// Subscription Pricing — Administrator-only (Content Managers must never reach
// pricing). Reads go through the request-scoped client: subjects_pricing RLS
// grants admins full select (status = 'active' or is_admin()), so no
// service-role client is needed here. Writes go through the
// admin_upsert_subject_price RPC in src/lib/admin/pricing.ts.
export default async function PricingPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const supabase = await createClient();

  const [subjectsRes, pricesRes] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, currency"),
  ]);

  const loadFailed = subjectsRes.error !== null || pricesRes.error !== null;
  if (loadFailed) {
    console.error(
      "[admin] pricing load failed",
      subjectsRes.error?.message ?? pricesRes.error?.message,
    );
  }

  const subjects = (subjectsRes.data ?? []) as { id: string; name: string }[];

  // subject_id → interval → { amount, currency }.
  const priceMap = new Map<
    string,
    Partial<Record<PriceInterval, { amount: number; currency: string }>>
  >();
  for (const row of (pricesRes.data ?? []) as {
    subject_id: string;
    interval: string;
    price_amount: number | string;
    currency: string | null;
  }[]) {
    if (!(PRICE_INTERVALS as readonly string[]).includes(row.interval)) continue;
    const amount = Number(row.price_amount); // numeric(12,2) may arrive as string
    if (!Number.isFinite(amount)) continue;
    const entry = priceMap.get(row.subject_id) ?? {};
    entry[row.interval as PriceInterval] = {
      amount,
      currency: row.currency ?? "AZN",
    };
    priceMap.set(row.subject_id, entry);
  }

  const intervalLabel: Record<PriceInterval, string> = {
    week: lt("pricing.weekly"),
    month: lt("pricing.monthly"),
    year: lt("pricing.yearly"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("pricing.title")}</h1>
        <p className="muted">{lt("pricing.subtitle")}</p>
      </div>

      <p className="hint">{lt("pricing.repriceNote")}</p>
      <p className="hint">{lt("pricing.currencyNote")}</p>

      {loadFailed ? (
        <div className="card">
          <p className="form-error" role="alert">
            {lt("pricing.loadError")}
          </p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="card">
          <p className="muted">{lt("pricing.empty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table pricing-table">
            <thead>
              <tr>
                <th>{lt("pricing.subject")}</th>
                {PRICE_INTERVALS.map((iv) => (
                  <th key={iv}>{intervalLabel[iv]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const rows = priceMap.get(subject.id) ?? {};
                return (
                  <tr key={subject.id}>
                    <td className="pricing-subject">{subject.name}</td>
                    {PRICE_INTERVALS.map((iv) => {
                      const cell = rows[iv];
                      return (
                        <td key={iv}>
                          <PriceCell
                            subjectId={subject.id}
                            interval={iv}
                            initialAmount={cell?.amount ?? null}
                            currency={cell?.currency ?? "AZN"}
                            strings={{
                              save: t("action.save"),
                              saving: t("manage.saving"),
                              saved: t("settings.saved"),
                              invalidAmount: lt("pricing.err.amount"),
                              notSet: lt("pricing.notSet"),
                              ariaLabel: `${subject.name} — ${intervalLabel[iv]}`,
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
