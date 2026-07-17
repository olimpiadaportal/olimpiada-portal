import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { ContactInfo } from "@/components/ContactInfo";

// Arena-shell Contact (student). Same shared contact card + map body (admin-
// configured support email/phone) as the public and parent pages; NO purchase
// or pricing surface — children never buy anything.
export default async function ChildContactPage() {
  await requireChild();
  const t = await getT();

  return (
    <section className="prose help-page">
      <div>
        <p className="arena-eyebrow">{t("nav.help")}</p>
        <h1>{t("help.contactTitle")}</h1>
      </div>
      <ContactInfo />
    </section>
  );
}
