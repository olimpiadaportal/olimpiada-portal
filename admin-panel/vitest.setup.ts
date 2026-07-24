import "@testing-library/jest-dom/vitest";

// React 19 form actions submit via requestSubmit. Recent jsdom implements it,
// but keep a minimal polyfill so the suite survives a jsdom without it.
if (
  typeof HTMLFormElement !== "undefined" &&
  typeof HTMLFormElement.prototype.requestSubmit !== "function"
) {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit(
    submitter?: HTMLElement,
  ) {
    if (submitter && (submitter as HTMLButtonElement).disabled) return;
    this.dispatchEvent(
      new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: submitter ?? null,
      }),
    );
  };
}
