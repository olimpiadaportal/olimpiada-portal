import { getT } from "@/i18n/server";
import FaqAccordion, { buildFaqItems } from "@/components/FaqAccordion";

export default async function FaqPage() {
  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("faq.title")}</h1>
      <FaqAccordion items={buildFaqItems(t)} />
    </section>
  );
}
