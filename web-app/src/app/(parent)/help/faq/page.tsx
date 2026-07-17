import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import FaqAccordion, { buildFaqItems } from "@/components/FaqAccordion";

// In-app (parent-shell) FAQ. Lives at /help/faq to avoid colliding with the public
// /faq route. Reuses the same faq.q1..q10/a1..a10 copy + FaqAccordion component.
export default async function ParentFaqPage() {
  await requireParent();
  const t = await getT();

  return (
    <section className="prose help-page">
      <h1>{t("help.faqTitle")}</h1>
      <FaqAccordion items={buildFaqItems(t)} />
    </section>
  );
}
