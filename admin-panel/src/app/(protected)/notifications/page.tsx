import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SettingEditor, type SettingFieldKind } from "@/components/SettingEditor";
import { FeatureFlagToggle } from "@/components/FeatureFlagToggle";
import {
  NotificationComposer,
  type ComposerStrings,
  type SubjectOption,
  type PackageOption,
  type TemplateRow,
} from "@/components/NotificationComposer";
import {
  NotificationHistory,
  type HistoryRow,
  type HistoryStrings,
} from "@/components/NotificationHistory";
import {
  NotificationTemplates,
  type TemplatesStrings,
} from "@/components/NotificationTemplates";
import { SETTING_META, FLAG_META, LOCALE_OPTIONS } from "@/lib/admin/settings-meta";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "./labels";

// Notifications module — Administrator-only (nav entry is adminOnly and the page
// guards with requireAdmin(); the RPCs additionally require the notifications.send
// permission, which only administrators hold). Content Managers can neither see
// nor reach it — same posture as News / Olympiad.
//
// Channel master switches surfaced here (feature_flags): notifications (in-app
// center), notifications_email, notifications_push. Retention lives in
// system_settings: notifications.retention_days / notifications.max_per_user.
const CHANNEL_FLAGS = ["notifications", "notifications_email", "notifications_push"] as const;
const RETENTION_KEYS = ["notifications.retention_days", "notifications.max_per_user"] as const;

export default async function NotificationsPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const supabase = await createClient();

  const [
    { data: historyRows },
    { data: templateRows },
    { data: subjectRows },
    { data: packageRows },
    { data: flagRows },
    { data: settingRows },
  ] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select(
        "id, title, body, template_code, channels, audience_type, audience_filter, status, total_recipients, delivered_count, failed_count, scheduled_at, sent_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_templates")
      .select("id, code, locale, subject, body")
      .order("code")
      .order("locale"),
    supabase.from("subjects").select("id, name").order("name"),
    // ACTIVE olympiad packages (az titles) for the olympiad_buyers audience.
    supabase
      .from("olympiad_packages")
      .select("id, code, status, olympiad_package_translations(locale, title)")
      .eq("status", "active"),
    supabase.from("feature_flags").select("key, enabled"),
    supabase.from("system_settings").select("key, value_json"),
  ]);

  const subjects: SubjectOption[] = ((subjectRows ?? []) as any[]).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  // az title preferred; any translation, then the internal code as fallback.
  const packages: PackageOption[] = ((packageRows ?? []) as any[])
    .map((p) => {
      const trs = (p.olympiad_package_translations ?? []) as {
        locale: string;
        title: string;
      }[];
      const az = trs.find((x) => x.locale === "az");
      return {
        id: p.id as string,
        title: String(az?.title ?? trs[0]?.title ?? p.code ?? p.id),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "az"));

  const templates: TemplateRow[] = ((templateRows ?? []) as any[]).map((r) => ({
    id: r.id,
    code: r.code,
    locale: r.locale,
    subject: r.subject ?? null,
    body: r.body,
  }));

  // For olympiad_buyers sends the composer stores a title snapshot in
  // audience_filter.package_titles (the DB resolver ignores extra keys);
  // legacy/handmade rows without one fall back to the raw package ids.
  const historyPackageTitles = (r: any): string[] | undefined => {
    if (r.audience_type !== "olympiad_buyers") return undefined;
    const filter =
      r.audience_filter && typeof r.audience_filter === "object"
        ? (r.audience_filter as Record<string, unknown>)
        : {};
    const titles = Array.isArray(filter.package_titles)
      ? (filter.package_titles as unknown[])
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((x) => x.slice(0, 200))
          .slice(0, 100)
      : [];
    if (titles.length > 0) return titles;
    const ids = Array.isArray(filter.package_ids)
      ? (filter.package_ids as unknown[])
          .filter((x): x is string => typeof x === "string")
          .slice(0, 100)
      : [];
    return ids.length > 0 ? ids : undefined;
  };

  const history: HistoryRow[] = ((historyRows ?? []) as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    audienceType: r.audience_type,
    channels: Array.isArray(r.channels) ? r.channels : [],
    status: r.status,
    totalRecipients: r.total_recipients ?? 0,
    deliveredCount: r.delivered_count ?? 0,
    failedCount: r.failed_count ?? 0,
    templateCode: r.template_code ?? null,
    scheduledAt: r.scheduled_at ?? null,
    sentAt: r.sent_at ?? null,
    createdAt: r.created_at,
    packageTitles: historyPackageTitles(r),
  }));

  const flagEnabled = new Map(
    ((flagRows ?? []) as { key: string; enabled: boolean }[]).map((f) => [
      f.key,
      f.enabled,
    ]),
  );
  const settingValue = new Map<string, unknown>();
  for (const row of (settingRows ?? []) as { key: string; value_json: unknown }[]) {
    settingValue.set(row.key, row.value_json);
  }

  // -------------------------------- strings --------------------------------
  const audienceLabels: Record<string, string> = {
    // all_users / olympiad_buyers / administrators / content_managers come
    // from the LOCAL trilingual labels until messages.ts gains the
    // ntfadmin.audience.* keys.
    all_users: lt("ntfadmin.audience.all_users"),
    all_parents: t("ntfadmin.audience.all_parents"),
    all_children: t("ntfadmin.audience.all_children"),
    olympiad_buyers: lt("ntfadmin.audience.olympiad_buyers"),
    parent: t("ntfadmin.audience.parent"),
    by_subject: t("ntfadmin.audience.by_subject"),
    individual: t("ntfadmin.audience.individual"),
    administrators: lt("ntfadmin.audience.administrators"),
    content_managers: lt("ntfadmin.audience.content_managers"),
  };
  const statusLabels: Record<string, string> = {
    draft: t("ntfadmin.status.draft"),
    scheduled: t("ntfadmin.status.scheduled"),
    sending: t("ntfadmin.status.sending"),
    sent: t("ntfadmin.status.sent"),
    failed: t("ntfadmin.status.failed"),
    canceled: t("ntfadmin.status.canceled"),
  };

  const composerStrings: ComposerStrings = {
    heading: t("ntfadmin.composer.heading"),
    template: t("ntfadmin.composer.template"),
    templateNone: t("ntfadmin.composer.templateNone"),
    templateHint: t("ntfadmin.composer.templateHint"),
    title: t("ntfadmin.composer.title"),
    titlePlaceholder: t("ntfadmin.composer.titlePlaceholder"),
    body: t("ntfadmin.composer.body"),
    bodyPlaceholder: t("ntfadmin.composer.bodyPlaceholder"),
    toolbarBold: t("ntfadmin.composer.bold"),
    toolbarItalic: t("ntfadmin.composer.italic"),
    toolbarLink: t("ntfadmin.composer.link"),
    linkPrompt: t("ntfadmin.composer.linkPrompt"),
    channels: t("ntfadmin.composer.channels"),
    channelInApp: t("ntfadmin.channel.in_app"),
    channelEmail: t("ntfadmin.channel.email"),
    channelPush: t("ntfadmin.channel.push"),
    channelInAppNote: t("ntfadmin.channel.inAppNote"),
    channelOffNote: t("ntfadmin.channel.offNote"),
    audience: t("ntfadmin.composer.audience"),
    audAllUsers: audienceLabels.all_users,
    audAllParents: audienceLabels.all_parents,
    audAllChildren: audienceLabels.all_children,
    audOlympiadBuyers: audienceLabels.olympiad_buyers,
    audParent: audienceLabels.parent,
    audBySubject: audienceLabels.by_subject,
    audAdministrators: audienceLabels.administrators,
    audContentManagers: audienceLabels.content_managers,
    subject: t("ntfadmin.composer.subject"),
    subjectChoose: t("ntfadmin.composer.subjectChoose"),
    pkgLabel: lt("ntfadmin.pkg.label"),
    pkgSearch: lt("ntfadmin.pkg.search"),
    pkgEmpty: lt("ntfadmin.pkg.empty"),
    pkgNoMatch: lt("ntfadmin.pkg.noMatch"),
    pkgChosen: lt("ntfadmin.pkg.chosen"),
    pkgSelectAll: lt("ntfadmin.pkg.selectAll"),
    pkgClear: lt("ntfadmin.pkg.clear"),
    pkgRemove: lt("ntfadmin.pkg.remove"),
    pkgHint: lt("ntfadmin.pkg.hint"),
    zeroRecipients: lt("ntfadmin.zeroRecipients"),
    recipients: t("ntfadmin.composer.recipients"),
    recipientsCounting: t("ntfadmin.composer.recipientsCounting"),
    recipientsPick: t("ntfadmin.composer.recipientsPick"),
    schedule: t("ntfadmin.composer.schedule"),
    scheduleHint: t("ntfadmin.composer.scheduleHint"),
    preview: t("ntfadmin.composer.preview"),
    previewEmpty: t("ntfadmin.composer.previewEmpty"),
    send: t("ntfadmin.composer.send"),
    sendScheduled: t("ntfadmin.composer.sendScheduled"),
    sending: t("ntfadmin.composer.sending"),
    sentNow: t("ntfadmin.composer.sentNow"),
    scheduled: t("ntfadmin.composer.scheduled"),
    confirmLarge: t("ntfadmin.composer.confirmLarge"),
    composeAnother: t("ntfadmin.composer.composeAnother"),
    parentSearch: t("ntfadmin.parent.search"),
    parentSearching: t("ntfadmin.parent.searching"),
    parentEmpty: t("ntfadmin.parent.empty"),
    parentClear: t("ntfadmin.parent.clear"),
    parentRemove: t("ntfadmin.parent.remove"),
    parentChosen: t("ntfadmin.parent.chosen"),
    parentAddHint: t("ntfadmin.parent.addHint"),
    parentChildren: t("ntfadmin.parent.children"),
  };

  const historyStrings: HistoryStrings = {
    heading: t("ntfadmin.history.heading"),
    colTitle: t("ntfadmin.history.colTitle"),
    colAudience: t("ntfadmin.history.colAudience"),
    colChannels: t("ntfadmin.history.colChannels"),
    colStatus: t("ntfadmin.history.colStatus"),
    colProgress: t("ntfadmin.history.colProgress"),
    colWhen: t("ntfadmin.history.colWhen"),
    none: t("ntfadmin.history.none"),
    view: t("ntfadmin.history.view"),
    detailTitle: t("ntfadmin.history.detailTitle"),
    bodyLabel: t("ntfadmin.history.bodyLabel"),
    templateLabel: t("ntfadmin.history.templateLabel"),
    packagesLabel: lt("ntfadmin.history.packagesLabel"),
    scheduledAtLabel: t("ntfadmin.history.scheduledAtLabel"),
    sentAtLabel: t("ntfadmin.history.sentAtLabel"),
    createdAtLabel: t("ntfadmin.history.createdAtLabel"),
    close: t("ntfadmin.close"),
    audience: audienceLabels,
    status: statusLabels,
  };

  const templatesStrings: TemplatesStrings = {
    heading: t("ntfadmin.tpl.heading"),
    new: t("ntfadmin.tpl.new"),
    newTitle: t("ntfadmin.tpl.newTitle"),
    editTitle: t("ntfadmin.tpl.editTitle"),
    code: t("ntfadmin.tpl.code"),
    codePlaceholder: t("ntfadmin.tpl.codePlaceholder"),
    codeHint: t("ntfadmin.tpl.codeHint"),
    locale: t("ntfadmin.tpl.locale"),
    subject: t("ntfadmin.tpl.subject"),
    body: t("ntfadmin.tpl.body"),
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    create: t("ntfadmin.tpl.create"),
    creating: t("ntfadmin.tpl.creating"),
    edit: t("ntfadmin.tpl.edit"),
    delete: t("ntfadmin.tpl.delete"),
    deleteTitle: t("ntfadmin.tpl.deleteTitle"),
    deleteText: t("ntfadmin.tpl.deleteText"),
    deleteConfirm: t("ntfadmin.tpl.deleteConfirm"),
    deleting: t("ntfadmin.tpl.deleting"),
    none: t("ntfadmin.tpl.none"),
    missing: t("ntfadmin.tpl.missing"),
    empty: t("ntfadmin.tpl.empty"),
    cancel: t("action.cancel"),
    close: t("ntfadmin.close"),
    working: t("ntfadmin.tpl.deleting"),
  };

  // --------------------------- settings section ----------------------------
  const editorBase = {
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    invalidJson: t("settings.err.invalidJson"),
    notFound: t("settings.err.notFound"),
    missing: t("settings.err.missing"),
    notConfigured: t("settings.notConfigured"),
    localesEmpty: t("settings.err.localesEmpty"),
    langAz: t("settings.lang.az"),
    langEn: t("settings.lang.en"),
    langRu: t("settings.lang.ru"),
  };

  function settingField(key: string) {
    const meta = SETTING_META[key];
    if (!meta || meta.kind === "boolean") return null;
    return (
      <SettingEditor
        key={key}
        settingKey={key}
        kind={meta.kind as SettingFieldKind}
        value={settingValue.get(key)}
        exists={settingValue.has(key)}
        localeOptions={LOCALE_OPTIONS}
        placeholder={meta.placeholder}
        min={meta.min}
        max={meta.max}
        strings={{ ...editorBase, label: t(meta.labelKey), help: t(meta.helpKey) }}
      />
    );
  }

  function channelFlagRow(key: string) {
    const meta = FLAG_META[key];
    if (!meta) return null;
    const enabled = flagEnabled.get(key);
    return (
      <div className="flag-row" key={key}>
        <div className="flag-info">
          <span className="flag-title">{t(meta.labelKey)}</span>
          <span className="flag-desc">{t(meta.descKey)}</span>
        </div>
        <div className="flag-controls">
          {enabled === undefined ? (
            <span className="sfield-missing">{t("settings.notConfigured")}</span>
          ) : (
            <FeatureFlagToggle
              flagKey={key}
              enabled={enabled}
              enableLabel={t("settings.enable")}
              disableLabel={t("settings.disable")}
              onText={t("settings.on")}
              offText={t("settings.off")}
            />
          )}
        </div>
      </div>
    );
  }

  // ------------------------------- tab content ------------------------------
  const composeTab = (
    <section className="card">
      <h3>{composerStrings.heading}</h3>
      <NotificationComposer
        subjects={subjects}
        packages={packages}
        templates={templates}
        strings={composerStrings}
      />
    </section>
  );

  const historyTab = (
    <section className="card">
      <h3>{historyStrings.heading}</h3>
      <NotificationHistory rows={history} locale={locale} strings={historyStrings} />
    </section>
  );

  const templatesTab = (
    <section className="card">
      <h3>{templatesStrings.heading}</h3>
      <NotificationTemplates templates={templates} strings={templatesStrings} />
    </section>
  );

  const settingsTab = (
    <div className="settings-panel-stack">
      <section className="card">
        <h3>{t("ntfadmin.settings.channelsHeading")}</h3>
        <p className="muted">{t("ntfadmin.settings.channelsDesc")}</p>
        <div className="flag-list">{CHANNEL_FLAGS.map((k) => channelFlagRow(k))}</div>
      </section>
      <section className="card">
        <h3>{t("ntfadmin.settings.retentionHeading")}</h3>
        <p className="muted">{t("ntfadmin.settings.retentionDesc")}</p>
        {RETENTION_KEYS.map((k) => settingField(k))}
      </section>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.notifications")}</h1>
        <p className="muted">{t("ntfadmin.subtitle")}</p>
      </div>

      <SettingsTabs
        tabs={[
          { id: "compose", label: t("ntfadmin.tab.compose"), content: composeTab },
          { id: "history", label: t("ntfadmin.tab.history"), content: historyTab },
          { id: "templates", label: t("ntfadmin.tab.templates"), content: templatesTab },
          { id: "settings", label: t("ntfadmin.tab.settings"), content: settingsTab },
        ]}
      />
    </div>
  );
}
