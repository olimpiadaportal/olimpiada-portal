"use client";

import { signOut } from "@/app/login/actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button className="btn-ghost" type="submit">
        {label}
      </button>
    </form>
  );
}
