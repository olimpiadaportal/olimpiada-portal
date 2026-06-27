import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/admin/guards";

// Entry: send signed-in panel users to the dashboard, others to login.
export default async function Index() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  redirect("/dashboard");
}
