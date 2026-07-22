// Sidebar model. `label` values are i18n keys translated in the (protected) layout
// before being passed to the client Sidebar. Hidden items are NOT a security
// boundary — routes are guarded server-side.

export type NavItem = {
  label: string; // i18n key
  href?: string;
  adminOnly?: boolean;
  permission?: string; // visible to admin OR holders of this permission
  soon?: boolean;
};

export type NavGroup = {
  label: string; // i18n key
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "group.overview",
    items: [
      { label: "nav.dashboard", href: "/dashboard" },
      { label: "nav.users", href: "/users", adminOnly: true },
    ],
  },
  {
    label: "group.taxonomy",
    items: [
      { label: "nav.grades", href: "/manage/grades", adminOnly: true },
      { label: "nav.subjects", href: "/manage/subjects", adminOnly: true },
      { label: "nav.topics", href: "/manage/topics", adminOnly: true },
      { label: "nav.subtopics", href: "/manage/subtopics", adminOnly: true },
      // Round 21: the separate Cities / Districts / Schools pages merged into
      // ONE hierarchical Locations screen. The label is resolved with a local
      // trilingual fallback in the layout until messages.ts gains the key.
      { label: "nav.locations", href: "/locations", adminOnly: true },
    ],
  },
  {
    label: "group.contentConfig",
    items: [
      // Dedicated advanced page (structure rules: status / option & correct
      // counts) — replaced the generic /manage registry page.
      { label: "nav.questionTypes", href: "/question-types", adminOnly: true },
      { label: "nav.olympiadTypes", href: "/manage/olympiad-types", adminOnly: true },
    ],
  },
  {
    label: "group.content",
    items: [
      { label: "nav.questions", href: "/questions", permission: "content.create" },
      { label: "nav.news", href: "/news", adminOnly: true },
      { label: "nav.olympiad", href: "/olympiad", adminOnly: true },
      // Round 11: Character Stickers replace the retired Wallpapers module.
      { label: "nav.stickers", href: "/stickers", adminOnly: true },
    ],
  },
  {
    label: "group.operations",
    items: [
      { label: "nav.accounts", href: "/accounts", adminOnly: true },
      { label: "nav.freeAccess", href: "/free-access", adminOnly: true },
      // Per-subject subscription prices (week/month/year). Administrator-only —
      // Content Managers must never reach pricing. Distinct from nav.subscriptions
      // below (subscription lifecycle monitoring/management).
      { label: "nav.pricing", href: "/pricing", adminOnly: true },
      // Round 31: subscription lifecycle monitoring (activate/extend/cancel/
      // expire demo+comped child subscriptions). Moved out of comingSoon now
      // that the module is built. The "nav.payments" placeholder stays in
      // comingSoon, untouched — a separate future module.
      { label: "nav.subscriptions", href: "/subscriptions", adminOnly: true },
      { label: "nav.leaderboard", href: "/leaderboard", adminOnly: true },
      // Administrator-only (requires notifications.send, which only admins hold —
      // Content Managers never see or reach it, same posture as News/Olympiad).
      {
        label: "nav.notifications",
        href: "/notifications",
        adminOnly: true,
        permission: "notifications.send",
      },
      // The admin's own received-notifications page (the topbar bell's "see
      // all" target) — route stays admin-only. A content manager can now also
      // RECEIVE rows (the composer's "content_managers" audience), but reads
      // them via the topbar bell dropdown only; this dedicated page is not
      // yet opened up to them (nav item is filtered out for CM sessions).
      // Local trilingual fallback (see the layout's navLabel chain) until
      // messages.ts gains the key.
      { label: "nav.alerts", href: "/alerts" },
      { label: "nav.audit", href: "/audit", adminOnly: true },
      { label: "nav.settings", href: "/settings", adminOnly: true },
      { label: "nav.siteContent", href: "/site-content", adminOnly: true },
      { label: "nav.mobileApp", href: "/mobile-app", adminOnly: true },
    ],
  },
  {
    label: "group.comingSoon",
    items: [
      // Round 31: the "nav.dailyTasks" placeholder was REMOVED (owner request).
      // Daily questions are generated AUTOMATICALLY by the daily-rounds engine
      // (get_or_create_daily_round, lazily on first student request) — there is
      // nothing for an admin to manage. Admin visibility into that engine lives
      // on the Questions page as the daily-round readiness grid. The legacy
      // daily_task_* tables were dropped back in migration 052.
      // Round 10 (F12): the "nav.reviews" placeholder was REMOVED — it never
      // had a page, and the review queue is already served by the Questions
      // list (in_review status filter + stat card, Round 9). A separate
      // Reviews module would just duplicate that flow.
      { label: "nav.payments", soon: true, adminOnly: true },
    ],
  },
];
