import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { ContactInfo } from "@/components/ContactInfo";

// In-app (parent-shell) Contact. Lives at /help/contact to avoid colliding with
// the public /contact route. Renders the shared contact card + map body (same
// admin-configured support email/phone as the public page).
export default async function ParentContactPage() {
  await requireParent();
  const t = await getT();

  return (
    <section className="prose help-page">
      <h1>{t("help.contactTitle")}</h1>
      {/* surface="parent": the account address is what the report is stamped
          with server-side, so the dialog does not ask for one. */}
      <ContactInfo surface="parent" />
    </section>
  );
}
