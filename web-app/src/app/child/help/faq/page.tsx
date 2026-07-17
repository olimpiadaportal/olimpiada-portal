import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import FaqAccordion, { buildFaqItems } from "@/components/FaqAccordion";

// Arena-shell FAQ (student). Same faq.q1..q10/a1..a10 copy + FaqAccordion as
// the public and parent pages; the `.arena .help-page` token remap in
// globals.css keeps the accordion on the arena palette.
export default async function ChildFaqPage() {
  await requireChild();
  const t = await getT();

  return (
    <section className="prose help-page">
      <div>
        <p className="arena-eyebrow">{t("nav.help")}</p>
        <h1>{t("help.faqTitle")}</h1>
      </div>
      <FaqAccordion items={buildFaqItems(t)} />
    </section>
  );
}
