"use client";

import { useActionState } from "react";
import { deleteCity, type CityDeleteState } from "@/lib/admin/cities";

// Delete a city. districts FK on schools is ON DELETE RESTRICT, so deletion of a
// city that still has schools fails — we surface a friendly inline message
// (errInUse) instead of crashing.
export function CityDeleteButton({
  id,
  label,
  confirmText,
  errInUse,
  errGeneric,
}: {
  id: string;
  label: string;
  confirmText: string;
  errInUse: string;
  errGeneric: string;
}) {
  const [state, formAction] = useActionState<CityDeleteState, FormData>(
    deleteCity,
    null,
  );

  const msg = state?.error
    ? state.error === "cityInUse"
      ? errInUse
      : errGeneric
    : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="__id" value={id} />
      <button className="link-danger" type="submit">
        {label}
      </button>
      {msg && (
        <span className="form-error" style={{ display: "block", marginTop: 4 }}>
          {msg}
        </span>
      )}
    </form>
  );
}
