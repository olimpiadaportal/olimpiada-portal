import { redirect } from "next/navigation";

// Round 21: city editing now happens in a Locations modal.
export default function CityEditRedirect() {
  redirect("/locations");
}
