import { redirect } from "next/navigation";

// Round 21: school editing now happens in a Locations modal.
export default function SchoolEditRedirect() {
  redirect("/locations");
}
