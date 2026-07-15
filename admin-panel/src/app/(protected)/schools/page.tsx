import { redirect } from "next/navigation";

// Round 21: Schools merged into the hierarchical Locations screen.
export default function SchoolsRedirect() {
  redirect("/locations");
}
