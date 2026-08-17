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
      // Round 52: the separate Topics / Subtopics registry pages were REPLACED
      // by ONE Curriculum Structure tree (Subject › Topic › Subtopic). Both
      // resources were removed from lib/admin/resources.ts in the same change,
      // so /manage/topics and /manage/subtopics now 404 by design. The label is
      // resolved with a local trilingual fallback in the layout until
      // messages.ts gains the key.
      { label: "nav.curriculum", href: "/curriculum", adminOnly: true },
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
      // Round 34: Olympiad Types left the sidebar — the type is now picked
      // (or created via "Other") INSIDE the package create/edit flow. The
      // /manage/olympiad-types registry route stays reachable for deep links;
      // no type records were touched.
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
      // "Report a problem" triage (migration 115). Administrator-only: no
      // `permission` field exists for it, so there is no code a content manager
      // could be granted by accident — and the page reveals answer keys.
      { label: "nav.questionReports", href: "/question-reports", adminOnly: true },
      // Platform bug reports (migration 116) — same posture as its sibling
      // above: adminOnly with NO `permission` field, so there is no code a
      // content manager could be granted by accident. It also displays text
      // filed by UNAUTHENTICATED visitors, which is not a content-manager
      // surface.
      { label: "nav.bugReports", href: "/bug-reports", adminOnly: true },
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
