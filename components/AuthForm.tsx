"use client";

import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { useState } from "react";
import { DoorThread } from "@/components/AuthArt";

export function AuthForm({
  mode,
  email = "",
}: {
  mode: "sign-in" | "sign-up" | "verify";
  email?: string;
}) {
  const [address, setAddress] = useState(email);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy =
    mode === "sign-up"
      ? { eyebrow: "The door", title: "Begin a thread", lede: "Every thread starts here. Your hands wait on the other side." }
      : mode === "verify"
        ? { eyebrow: "One knot", title: "Check your email", lede: "Enter the 6-digit code. It expires in 15 minutes." }
        : { eyebrow: "The door", title: "Pick up the thread", lede: "Your work is where you left it." };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "verify") {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address, code }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "Could not verify that code");
          return;
        }
        window.location.href = "/";
        return;
      }

      const response = await fetch(mode === "sign-up" ? "/api/auth/sign-up" : "/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, password }),
      });
      const body = (await response.json()) as { error?: string; verify?: boolean };
      if (!response.ok) {
        setError(body.error ?? "Could not continue");
        if (response.status === 403) {
          window.location.href = `/verify?email=${encodeURIComponent(address)}`;
        }
        return;
      }
      if (body.verify) {
        window.location.href = `/verify?email=${encodeURIComponent(address)}`;
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not send another code");
        return;
      }
      setNotice("A new code is on its way.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="door-page">
      <div className="door">
        <div className="door-threshold" aria-hidden />
        <DoorThread knot={mode === "verify" ? "gate" : "thread"} />
        <div className="relative grid gap-[22px]">
          <div className="door-rise flex justify-center">
            <BrandMark />
          </div>
          <div className="door-rise grid gap-2.5 text-center" style={{ "--delay": ".15s" } as React.CSSProperties}>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="font-serif text-[38px] leading-none font-normal tracking-[-0.015em] sm:text-[44px]">{copy.title}</h1>
            <p className="text-sm leading-normal text-ink-dim">{copy.lede}</p>
          </div>
          <div className="door-rise grid gap-4" style={{ "--delay": ".3s" } as React.CSSProperties}>
            <form onSubmit={(event) => void submit(event)} className="grid gap-3.5">
              <label className="door-label">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="you@studio.com"
                  className="door-input"
                />
              </label>
              {mode === "verify" ? (
                <label className="door-label">
                  Code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="6 digits"
                    className="door-input font-mono tracking-[0.3em]"
                  />
                </label>
              ) : (
                <label className="door-label">
                  Password
                  <input
                    type="password"
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="door-input"
                  />
                </label>
              )}
              {error ? <p className="text-sm leading-normal text-danger" role="alert">{error}</p> : null}
              {notice ? <p className="text-sm leading-normal text-ok" role="status">{notice}</p> : null}
              <button type="submit" disabled={busy} className="rt-btn rt-btn-thread h-10 w-full text-sm">
                {busy ? "Working" : mode === "sign-up" ? "Create account" : mode === "verify" ? "Verify" : "Sign in"}
              </button>
            </form>
            <p className="door-links text-[13px] text-ink-dim">
              {mode === "verify" ? (
                <>
                  Nothing arrived?{" "}
                  <button type="button" onClick={() => void resend()} disabled={busy} className="touch-pad text-thread hover:text-thread-bright">
                    Send another code
                  </button>
                  {" · "}
                  <Link href="/sign-in" className="touch-pad text-thread hover:text-thread-bright">
                    Use a different email
                  </Link>
                </>
              ) : mode === "sign-in" ? (
                <>
                  New here?{" "}
                  <Link href="/sign-up" className="touch-pad text-thread hover:text-thread-bright">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/sign-in" className="touch-pad text-thread hover:text-thread-bright">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
