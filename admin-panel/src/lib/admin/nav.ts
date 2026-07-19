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
      // Content Managers must never reach pricing. The "nav.subscriptions"
      // soon-placeholder below is a DIFFERENT future module (subscription
      // monitoring), intentionally left untouched.
      { label: "nav.pricing", href: "/pricing", adminOnly: true },
      { label: "nav.leaderboard", href: "/leaderboard", adminOnly: true },
      // Administrator-only (requires notifications.send, which only admins hold —
      // Content Managers never see or reach it, same posture as News/Olympiad).
      {
        label: "nav.notifications",
        href: "/notifications",
        adminOnly: true,
        permission: "notifications.send",
      },
      // Received operational alerts (the topbar bell's "see all" page) —
      // admin-only, same posture as notifications.send above: only
      // administrator profiles ever receive these rows. Local trilingual
      // fallback (see the layout's navLabel chain) until messages.ts gains
      // the key.
      { label: "nav.alerts", href: "/alerts", adminOnly: true },
      { label: "nav.audit", href: "/audit", adminOnly: true },
      { label: "nav.settings", href: "/settings", adminOnly: true },
      { label: "nav.siteContent", href: "/site-content", adminOnly: true },
      { label: "nav.mobileApp", href: "/mobile-app", adminOnly: true },
    ],
  },
  {
    label: "group.comingSoon",
    items: [
      // Round 10 (F11): "Tests & Daily Tasks" trimmed to Daily Tasks only —
      // standalone tests are already covered by the Questions module. Visible
      // to Admins AND Content Managers (CMs will manage daily tasks), so it is
      // permission-gated rather than adminOnly.
      { label: "nav.dailyTasks", soon: true, permission: "content.create" },
      // Round 10 (F12): the "nav.reviews" placeholder was REMOVED — it never
      // had a page, and the review queue is already served by the Questions
      // list (in_review status filter + stat card, Round 9). A separate
      // Reviews module would just duplicate that flow.
      { label: "nav.subscriptions", soon: true, adminOnly: true },
      { label: "nav.payments", soon: true, adminOnly: true },
    ],
  },
];
