"use client";

import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { useState } from "react";
import { DAILY_MODEL_RUNS } from "@/lib/limits";

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

  const title = mode === "sign-up" ? "Create an account" : mode === "verify" ? "Check your email" : "Sign in";

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
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <BrandMark />
      <h1 className="mt-6 font-serif text-[44px] font-normal leading-none tracking-[-0.015em]">{title}</h1>
      <p className="mt-2 text-sm leading-normal text-ink-dim">
        {mode === "verify"
          ? "Enter the 6-digit code. It expires in 15 minutes."
          : `Each account gets ${DAILY_MODEL_RUNS} model runs a day. That cap protects the API credits.`}
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-3">
        <label className="block text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full bg-canvas px-3 py-2 text-sm ring-1 ring-line"
          />
        </label>
        {mode === "verify" ? (
          <label className="block text-sm">
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1 w-full bg-canvas px-3 py-2 font-mono text-sm ring-1 ring-line"
            />
          </label>
        ) : (
          <label className="block text-sm">
            Password
            <input
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full bg-canvas px-3 py-2 text-sm ring-1 ring-line"
            />
          </label>
        )}
        {error ? <p className="text-sm leading-normal text-danger">{error}</p> : null}
        {notice ? <p className="text-sm leading-normal text-ok">{notice}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="bg-thread px-3 py-2 text-sm font-medium text-raised disabled:opacity-50"
        >
          {busy ? "Working" : mode === "sign-up" ? "Create account" : mode === "verify" ? "Verify" : "Sign in"}
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-sm text-ink-dim">
        {mode === "verify" ? (
          <button type="button" onClick={() => void resend()} className="w-fit text-thread hover:text-thread-bright">
            Send another code
          </button>
        ) : null}
        {mode === "sign-in" ? (
          <Link href="/sign-up" className="text-thread hover:text-thread-bright">
            Create an account
          </Link>
        ) : (
          <Link href="/sign-in" className="text-thread hover:text-thread-bright">
            Already have an account
          </Link>
        )}
      </div>
    </main>
  );
}
