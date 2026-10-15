"use client";

import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DoorThread } from "@/components/AuthArt";
import { MAX_INVITE_CODE_CHARS } from "@/lib/limits";
import { TURNSTILE_SCRIPT, TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * The Turnstile check on sign-up. The widget is invisible unless Cloudflare wants an
 * interaction; its token is single-use, so the form resets it after every attempt.
 * `token()` waits briefly for a token that is still on its way.
 */
function useTurnstile(enabled: boolean) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const value = useRef("");
  const waiters = useRef<((token: string) => void)[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const settle = (token: string) => {
      value.current = token;
      const list = waiters.current;
      waiters.current = [];
      list.forEach((resolve) => resolve(token));
    };
    const render = () => {
      if (cancelled || widget.current !== null || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "sign-up",
        appearance: "interaction-only",
        theme: "light",
        size: "flexible",
        "refresh-expired": "auto",
        callback: (token: string) => {
          setFailed(false);
          settle(token);
        },
        "expired-callback": () => {
          value.current = "";
        },
        "error-callback": () => {
          setFailed(true);
          settle("");
          return true;
        },
      });
    };
    if (!document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const poll = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(poll);
        render();
      }
    }, 150);
    render();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (widget.current !== null && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [enabled]);

  function token(ms = 8000): Promise<string> {
    if (value.current) return Promise.resolve(value.current);
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      window.setTimeout(() => resolve(value.current), ms);
    });
  }

  function reset() {
    value.current = "";
    if (widget.current !== null && window.turnstile) window.turnstile.reset(widget.current);
  }

  return { box, token, reset, failed };
}

export function AuthForm({
  mode,
  email = "",
}: {
  mode: "sign-in" | "sign-up" | "verify" | "forgot" | "reset";
  email?: string;
}) {
  const [resetToken, setResetToken] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (mode !== "reset") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setResetToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, [mode]);
  const [address, setAddress] = useState(email);
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const [askInvite, setAskInvite] = useState(false);
  const { box: turnstileBox, token: turnstileToken, reset: resetTurnstile, failed: turnstileFailed } = useTurnstile(mode === "sign-up");

  // An invite link (/sign-up?invite=CODE) fills the code in. The page itself stays static.
  useEffect(() => {
    if (mode !== "sign-up") return;
    const code = new URLSearchParams(window.location.search).get("invite")?.trim();
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setInvite(code.slice(0, MAX_INVITE_CODE_CHARS));
    setAskInvite(true);
  }, [mode]);

  const copy =
    mode === "sign-up"
      ? { eyebrow: "The door", title: "Begin a thread", lede: "Create your account. Next, ask Ariadne a question: Odysseus answers, Daedalus checks the key claims against your sources and the web, and you judge only what it flags." }
      : mode === "forgot"
        ? { eyebrow: "Forgot password", title: "Reset your password", lede: "Enter your account email. We'll send a link that works once and expires in 30 minutes." }
      : mode === "reset"
        ? { eyebrow: "New password", title: "Choose a new password", lede: "At least 8 characters. Every device signed in to this account will be signed out." }
      : mode === "verify"
        ? { eyebrow: "One knot", title: "Check your email", lede: "Enter the 6-digit code. It expires in 15 minutes." }
        : { eyebrow: "The door", title: "Pick up the thread", lede: "Your work is where you left it." };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot" || mode === "reset") {
        const response = await fetch(mode === "forgot" ? "/api/auth/forgot" : "/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "forgot" ? { email: address } : { token: resetToken, password }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!response.ok) {
          setError(body.error ?? "Could not continue");
          return;
        }
        setNotice(body.message ?? "Done.");
        setDone(true);
        return;
      }
      if (mode === "verify") {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address, code }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "Could not verify that code");
          return;
        }
        window.location.href = "/dashboard";
        return;
      }

      const signUp = mode === "sign-up";
      const humanToken = signUp ? await turnstileToken() : undefined;
      const response = await fetch(signUp ? "/api/auth/sign-up" : "/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signUp ? { email: address, password, turnstileToken: humanToken, inviteCode: invite, privacyConsent: agreed } : { email: address, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; verify?: boolean; invite?: boolean };
      if (!response.ok) {
        // Turnstile tokens are single-use: get a fresh one for the next attempt.
        if (signUp) resetTurnstile();
        setError(body.error ?? "Could not continue");
        if (signUp && body.invite) setAskInvite(true);
        if (!signUp && response.status === 403) {
          window.location.href = `/verify?email=${encodeURIComponent(address)}`;
        }
        return;
      }
      if (body.verify) {
        window.location.href = `/verify?email=${encodeURIComponent(address)}`;
        return;
      }
      window.location.href = "/dashboard";
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
      const body = (await response.json().catch(() => ({}))) as { error?: string };
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
            <Link href="/" prefetch={false} aria-label="Ariadne, home" className="touch-min">
              <BrandMark />
            </Link>
          </div>
          <div className="door-rise grid gap-2.5 text-center" style={{ "--delay": ".15s" } as React.CSSProperties}>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="font-serif text-[38px] leading-none font-normal tracking-[-0.015em] sm:text-[44px]">{copy.title}</h1>
            <p className="text-sm leading-normal text-ink-dim">{copy.lede}</p>
          </div>
          <div className="door-rise grid gap-4" style={{ "--delay": ".3s" } as React.CSSProperties}>
            <form onSubmit={(event) => void submit(event)} className="grid gap-3.5">
              {mode === "reset" && !resetToken ? (
                <p className="text-sm leading-normal text-danger" role="alert">
                  This page needs the link from your reset email. <Link href="/forgot-password" className="text-thread">Ask for a new one</Link>.
                </p>
              ) : null}
              {mode !== "reset" ? (
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
              ) : null}
              {mode === "forgot" ? null : mode === "verify" ? (
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
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="door-input"
                  />
                </label>
              )}
              {mode === "sign-up" && askInvite ? (
                <label className="door-label">
                  Invite code
                  <input
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                    maxLength={MAX_INVITE_CODE_CHARS}
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                    placeholder="From your invitation"
                    className="door-input"
                  />
                </label>
              ) : null}
              {mode === "sign-up" ? (
                <label className="flex items-start gap-2 text-[13px] leading-normal text-ink-dim" data-testid="privacy-consent">
                  <input type="checkbox" required checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-thread)]" />
                  <span>
                    I agree to the{" "}
                    <a href="/privacy" target="_blank" rel="noopener" className="text-thread underline">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
              ) : null}
              {mode === "sign-up" ? <div ref={turnstileBox} className="min-h-0 empty:hidden" data-turnstile /> : null}
              {mode === "sign-up" && turnstileFailed ? (
                <p className="text-[13px] leading-normal text-ink-dim" role="status">
                  The human check could not load. Reload the page, or allow challenges.cloudflare.com, then try again.
                </p>
              ) : null}
              {error ? <p className="text-sm leading-normal text-danger" role="alert">{error}</p> : null}
              {notice ? <p className="text-sm leading-normal text-ok" role="status">{notice}</p> : null}
              <button type="submit" disabled={busy || done || (mode === "reset" && !resetToken)} className="rt-btn rt-btn-thread h-10 w-full text-sm">
                {busy ? "Working" : mode === "sign-up" ? "Create account" : mode === "verify" ? "Verify" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Set new password" : "Sign in"}
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
                  <Link href="/forgot-password" className="touch-pad text-thread hover:text-thread-bright">
                    Forgot password?
                  </Link>
                  {" · "}
                  New here?{" "}
                  <Link href="/sign-up" className="touch-pad text-thread hover:text-thread-bright">
                    Create an account
                  </Link>
                </>
              ) : mode === "forgot" || mode === "reset" ? (
                <>
                  <Link href="/sign-in" className="touch-pad text-thread hover:text-thread-bright">
                    Back to sign in
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
