import { redirect } from "next/navigation";

// Round 21: district (rayon) editing now happens in a Locations modal.
export default function DistrictEditRedirect() {
  redirect("/locations");
}
