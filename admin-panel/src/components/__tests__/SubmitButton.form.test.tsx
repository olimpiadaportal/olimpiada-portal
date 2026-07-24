// SubmitButton inside a real React 19 <form action={...}> (jsdom + RTL).
// Covers the owner-required loading-state behavior end to end:
// disable-on-submit, spinner/pendingLabel, rapid multi-click, Enter-key
// repeat, and re-enable after success AND failure.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubmitButton } from "../ActionButton";

/** A promise whose settlement the test controls. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <input aria-label="Title" name="title" defaultValue="Hello" />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/**
 * Mirrors the app pattern for failing requests: the submitted form action
 * awaits the underlying request and reports failure via state instead of
 * rethrowing (React 19 sends uncaught form-action errors to the nearest
 * error boundary, which would unmount the form).
 */
function CatchingHarness({ action }: { action: () => Promise<void> }) {
  return (
    <Harness
      action={async () => {
        try {
          await action();
        } catch {
          // swallowed — real forms set an error message here
        }
      }}
    />
  );
}

describe("SubmitButton in a real <form action>", () => {
  it("disables the button with aria-busy immediately after submission starts", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(<Harness action={action} />);

    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeEnabled();

    await user.click(btn);

    expect(action).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");

    gate.resolve();
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it("shows the spinner and pendingLabel during the request, idle label as aria-hidden ghost", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(<Harness action={action} />);

    const btn = screen.getByRole("button", { name: "Save" });
    await user.click(btn);

    await waitFor(() => expect(btn.querySelector(".btn-spinner")).not.toBeNull());
    expect(screen.getByRole("button", { name: "Saving…" })).toBe(btn);
    const ghost = btn.querySelector(".btn-ghost-label");
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost).toHaveTextContent("Save");

    gate.resolve();
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn.querySelector(".btn-spinner")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBe(btn);
  });

  it("rapid triple-click triggers the underlying action exactly once", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(<Harness action={action} />);

    const btn = screen.getByRole("button", { name: "Save" });
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);

    expect(action).toHaveBeenCalledTimes(1);

    gate.resolve();
    await waitFor(() => expect(btn).toBeEnabled());
    // No queued re-submission fires after the first one settles.
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("Enter-key repeat inside a form input does not double-submit while pending", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(<Harness action={action} />);

    const input = screen.getByLabelText("Title");
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);

    // Implicit submission clicks the default submit button; while pending it
    // is disabled, so held/repeated Enter presses die here.
    await user.keyboard("{Enter}{Enter}");
    expect(action).toHaveBeenCalledTimes(1);

    gate.resolve();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("re-enables the button after a FAILED request", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(<CatchingHarness action={action} />);

    const btn = screen.getByRole("button", { name: "Save" });
    await user.click(btn);
    expect(btn).toBeDisabled();

    gate.reject(new Error("request failed"));
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn).not.toHaveAttribute("aria-busy");
    await expect(gate.promise).rejects.toThrow("request failed");
  });

  it("re-enables the button after a successful request and accepts a new submission", async () => {
    const first = deferred();
    const second = deferred();
    const action = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const user = userEvent.setup();
    render(<Harness action={action} />);

    const btn = screen.getByRole("button", { name: "Save" });
    await user.click(btn);
    expect(btn).toBeDisabled();

    first.resolve();
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn).not.toHaveAttribute("aria-busy");

    // The re-enabled button submits again like new.
    await user.click(btn);
    expect(action).toHaveBeenCalledTimes(2);
    expect(btn).toBeDisabled();
    second.resolve();
    await waitFor(() => expect(btn).toBeEnabled());
  });
});
