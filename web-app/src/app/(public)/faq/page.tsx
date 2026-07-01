import { getT } from "@/i18n/server";
import FaqAccordion, { type FaqItem } from "@/components/FaqAccordion";

export default async function FaqPage() {
  const t = await getT();
  const items: FaqItem[] = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return { q: t(`faq.q${n}`), a: t(`faq.a${n}`) };
  });
  return (
    <section className="prose">
      <h1>{t("faq.title")}</h1>
      <FaqAccordion items={items} />
    </section>
  );
}
