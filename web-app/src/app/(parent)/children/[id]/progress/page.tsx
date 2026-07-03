import { redirect } from "next/navigation";

// R8 — per-child progress moved into the unified parent analytics dashboard.
// Old bookmarks/links land here; send them to /analytics (which runs its own
// requireParent guard and shows the child selector + subject tabs).
export default async function ProgressPage() {
  redirect("/analytics");
}
