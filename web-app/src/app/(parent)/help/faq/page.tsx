import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import FaqAccordion, { type FaqItem } from "@/components/FaqAccordion";

// In-app (parent-shell) FAQ. Lives at /help/faq to avoid colliding with the public
// /faq route. Reuses the same faq.q1..q10/a1..a10 copy + FaqAccordion component.
export default async function ParentFaqPage() {
  await requireParent();
  const t = await getT();
  const items: FaqItem[] = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return { q: t(`faq.q${n}`), a: t(`faq.a${n}`) };
  });

  return (
    <section className="prose help-page">
      <h1>{t("help.faqTitle")}</h1>
      <FaqAccordion items={items} />
    </section>
  );
}
