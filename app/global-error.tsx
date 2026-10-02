"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it brings its own document and inline
// styles (globals.css and the fonts are not loaded here).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f2ece1", color: "#1f1a14", fontFamily: "Georgia, 'Iowan Old Style', serif" }}>
        <title>Ariadne</title>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "96px 24px" }}>
          <p style={{ fontStyle: "italic", fontSize: 26, margin: 0 }}>Ariadne</p>
          <h1 style={{ fontWeight: 400, fontSize: 40, lineHeight: 1.05, margin: "24px 0 0" }}>The workspace hit an error</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, lineHeight: 1.5, color: "#5e554a", margin: "12px 0 0" }}>
            Your projects and every spun step are saved. Try again, or reload the page. This screen does not start an
            agent run.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 20,
              padding: "8px 14px",
              border: 0,
              borderRadius: 8,
              background: "#b3302a",
              color: "#fbf8f2",
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
