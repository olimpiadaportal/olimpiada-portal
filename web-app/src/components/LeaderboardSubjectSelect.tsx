"use client";

// L1 (migration 048 round) — subject picker for the child leaderboard's
// SUBJECT scope. URL stays the single source of truth: the SERVER page builds
// one whitelisted href per ACTIVE subject and passes them down; this component
// only navigates to a server-built href (router.replace, scroll kept — same
// discipline as the scope/period chip links). It never constructs query
// strings from raw values, so the server-side uuid clamp is the only gate.
import { useRouter } from "next/navigation";

export type LeaderboardSubjectOption = {
  id: string;
  name: string;
  /** Server-built canonical URL for this subject (default subject omits ?subject=). */
  href: string;
};

export function LeaderboardSubjectSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: LeaderboardSubjectOption[];
}) {
  const router = useRouter();
  return (
    <label className="lb-subject-picker">
      <span className="lb-subject-picker-label">{label}</span>
      <select
        className="lb-subject-select"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const target = options.find((o) => o.id === e.target.value);
          if (target) router.replace(target.href, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
