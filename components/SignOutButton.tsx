"use client";

import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch("/api/auth/sign-out", { method: "POST" }).finally(() => {
          window.location.assign("/sign-in");
        });
      }}
      className="rt-btn"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
