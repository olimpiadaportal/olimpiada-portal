"use client";

// Global error boundary state.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Something went wrong</h1>
        <p className="muted">An unexpected error occurred. Please try again.</p>
      </div>
      <button className="btn" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
