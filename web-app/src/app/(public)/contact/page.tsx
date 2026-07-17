import { getT } from "@/i18n/server";
import { ContactInfo } from "@/components/ContactInfo";

// Public Contact page: title + lead, then the shared card/map body (also used
// by the in-app parent and student contact pages).
export default async function ContactPage() {
  const t = await getT();

  return (
    <section className="prose">
      <h1>{t("contact.title")}</h1>
      <p className="lead">{t("contact.lead")}</p>
      <ContactInfo />
    </section>
  );
}
