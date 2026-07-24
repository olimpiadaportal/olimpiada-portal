// Loading-state contract of ActionButton (controlled `pending` prop).
// The real-form submission behavior of SubmitButton lives in
// SubmitButton.form.test.tsx.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionButton } from "../ActionButton";

describe("ActionButton (controlled pending)", () => {
  it("is enabled with the idle label and no spinner when not pending", () => {
    render(<ActionButton pending={false}>Save</ActionButton>);

    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    expect(btn.querySelector(".btn-spinner")).toBeNull();
    expect(btn.querySelector(".btn-ghost-label")).toBeNull();
  });

  it("disables itself and carries aria-busy=\"true\" while pending", () => {
    render(<ActionButton pending>Save</ActionButton>);

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("shows the spinner and pendingLabel while pending, keeping the idle label as an aria-hidden ghost", () => {
    render(
      <ActionButton pending pendingLabel="Saving…">
        Save
      </ActionButton>,
    );

    const btn = screen.getByRole("button");
    const spinner = btn.querySelector(".btn-spinner");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute("aria-hidden", "true");

    // pendingLabel replaces the idle label in the accessible name; the idle
    // label survives only as the aria-hidden width-preserving ghost.
    expect(screen.getByRole("button", { name: "Saving…" })).toBe(btn);
    const ghost = btn.querySelector(".btn-ghost-label");
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost).toHaveTextContent("Save");
  });

  it("falls back to the idle children as the pending label when pendingLabel is omitted", () => {
    render(<ActionButton pending>Save</ActionButton>);

    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.querySelector(".btn-spinner")).not.toBeNull();
  });

  it("stays disabled with disabled={true} regardless of pending", () => {
    const { rerender } = render(
      <ActionButton pending={false} disabled>
        Save
      </ActionButton>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();

    rerender(
      <ActionButton pending disabled>
        Save
      </ActionButton>,
    );
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");

    rerender(
      <ActionButton pending={false} disabled>
        Save
      </ActionButton>,
    );
    expect(btn).toBeDisabled();
  });
});
