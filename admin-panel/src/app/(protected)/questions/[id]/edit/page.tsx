import { redirect } from "next/navigation";

// Round 22: question editing moved into a modal on /questions (the row's Edit
// button opens it). This route only keeps old bookmarks/deep links from
// 404ing; the (protected) layout still enforces panel access first.
export default async function LegacyQuestionEditRedirect() {
  redirect("/questions");
}
