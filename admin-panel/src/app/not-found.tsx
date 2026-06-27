import Link from "next/link";

// Global 404 state.
export default function NotFound() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Page not found</h1>
        <p className="muted">The page you’re looking for doesn’t exist.</p>
      </div>
      <Link href="/">Back to dashboard</Link>
    </div>
  );
}
