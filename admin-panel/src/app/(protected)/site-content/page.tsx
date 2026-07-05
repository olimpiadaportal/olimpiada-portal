import { requireAdmin } from "@/lib/admin/guards";
import {
  ContentManager,
  type CmsSection,
} from "@/components/ContentManager";
import { listSiteContent } from "@/lib/admin/siteContent";
import { SECTIONS } from "@/lib/admin/siteContentRegistry";
import { getT } from "@/i18n/server";

// Website Content (Admin-only) — a TEXT-ONLY CMS for the public site's visible
// strings. Content is organised as SECTION → MENU → trilingual entries; the
// admin picks a section, then a menu, then edits that menu's text. Overrides are
// written to `public.site_content` (the web-app layers them over its i18n).
export default async function SiteContentPage() {
  await requireAdmin();
  const t = await getT();

  const items = await listSiteContent();

  // Build the section → menu → entries tree the client component renders,
  // resolving human labels via i18n. Entries follow registry (list) order.
  const sections: CmsSection[] = SECTIONS.map((s) => ({
    id: s.id,
    label: t(`siteContent.section.${s.id}`),
    menus: s.menus.map((menuId) => ({
      id: menuId,
      label: t(`siteContent.menu.${menuId}`),
      entries: items
        .filter((i) => i.section === s.id && i.menu === menuId)
        .map((i) => ({
          key: i.key,
          multiline: i.multiline,
          az: i.current.az,
          en: i.current.en,
          ru: i.current.ru,
          isOverridden: i.isOverridden,
        })),
    })),
  }));

  const strings = {
    sectionLabel: t("siteContent.sectionLabel"),
    menuLabel: t("siteContent.menuLabel"),
    selectSection: t("siteContent.selectSection"),
    selectMenu: t("siteContent.selectMenu"),
    save: t("siteContent.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    cancel: t("siteContent.cancel"),
    empty: t("siteContent.empty"),
    emptyHint: t("siteContent.emptyHint"),
    usingDefault: t("siteContent.usingDefault"),
    overridden: t("siteContent.overridden"),
    langAz: t("settings.lang.az"),
    langEn: t("settings.lang.en"),
    langRu: t("settings.lang.ru"),
    errServer: t("siteContent.err.server"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("siteContent.title")}</h1>
        <p className="muted">{t("siteContent.subtitle")}</p>
      </div>

      <ContentManager sections={sections} strings={strings} />
    </div>
  );
}
