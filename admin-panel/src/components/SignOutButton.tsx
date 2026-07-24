"use client";

import { signOut } from "@/app/login/actions";
import { SubmitButton } from "@/components/ActionButton";

export function SignOutButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel?: string;
}) {
  return (
    <form action={signOut}>
      <SubmitButton className="btn-ghost" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
