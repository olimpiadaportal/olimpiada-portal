import { redirect } from "next/navigation";

// Round 21: Districts (rayons) merged into the hierarchical Locations screen.
export default function DistrictsRedirect() {
  redirect("/locations");
}
