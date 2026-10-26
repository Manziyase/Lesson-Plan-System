"use client";

/*
 * Route-level error boundary: runtime failures render this instead of a
 * bare 500, and the full error (message + digest) is printed to the browser
 * console so problems stay debuggable. Next.js also logs the same error in
 * the terminal / server output.
 */

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", error.digest ? `(digest ${error.digest}) ` : "", error.message, error.stack ?? "");
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ maxWidth: 480, textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
        <h1 style={{ fontSize: "1.1rem" }}>{error.digest ? "Something went wrong" : "Unexpected error"}</h1>
        <p className="muted" style={{ margin: 0, wordBreak: "break-word" }}>
          {error.message || "Please try again in a moment."}
        </p>
        {error.digest ? (
          <code className="muted" style={{ fontSize: ".75rem" }}>
            digest: {error.digest}
          </code>
        ) : null}
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
