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
      { label: "nav.cities", href: "/cities", adminOnly: true },
      { label: "nav.schools", href: "/schools", adminOnly: true },
    ],
  },
  {
    label: "group.contentConfig",
    items: [
      { label: "nav.questionTypes", href: "/manage/question-types", adminOnly: true },
      { label: "nav.olympiadTypes", href: "/manage/olympiad-types", adminOnly: true },
    ],
  },
  {
    label: "group.content",
    items: [
      { label: "nav.questions", href: "/questions", permission: "content.create" },
      { label: "nav.news", href: "/news", adminOnly: true },
      { label: "nav.olympiad", href: "/olympiad", adminOnly: true },
      { label: "nav.wallpapers", href: "/wallpapers", adminOnly: true },
    ],
  },
  {
    label: "group.operations",
    items: [
      { label: "nav.accounts", href: "/accounts", adminOnly: true },
      { label: "nav.audit", href: "/audit", adminOnly: true },
      { label: "nav.settings", href: "/settings", adminOnly: true },
    ],
  },
  {
    label: "group.comingSoon",
    items: [
      { label: "nav.testsDailyTasks", soon: true },
      { label: "nav.reviews", soon: true },
      { label: "nav.subscriptions", soon: true, adminOnly: true },
      { label: "nav.payments", soon: true, adminOnly: true },
    ],
  },
];
