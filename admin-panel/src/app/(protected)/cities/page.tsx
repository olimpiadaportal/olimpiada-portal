import { redirect } from "next/navigation";

// Round 21: Cities merged into the hierarchical Locations screen.
export default function CitiesRedirect() {
  redirect("/locations");
}
