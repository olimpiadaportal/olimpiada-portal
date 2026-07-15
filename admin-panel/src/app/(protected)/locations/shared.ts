// Shared plain module (NO "use client"/"use server" directive) for the
// Locations screen: the row shapes the server page loads and the client
// explorer renders, plus the needs-district review sentinel. Kept separate so
// the SERVER page can import the sentinel as a real value (importing constants
// from a "use client" module would hand the server a client reference instead).

export type CityItem = {
  id: string;
  name: string;
  status: string;
  districtCount: number;
  schoolCount: number;
};

export type DistrictItem = {
  id: string;
  cityId: string;
  name: string;
  status: string;
  schoolCount: number;
};

export type SchoolItem = {
  id: string;
  name: string;
  status: string;
  isPrivate: boolean;
  districtId: string; // the CITY (schools.district_id)
  cityDistrictId: string | null; // the rayon (nullable)
};

// Sentinel for the needs-district review selection (never a real uuid).
export const NEEDS_DISTRICT = "none";
