"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX = 60;

/** Settings → You: the user's first and last name, edited in place. */
export function NameForm({ firstName, lastName, email }: { firstName: string; lastName: string; email: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: first, lastName: last }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; firstName?: string; lastName?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Your name could not be saved.");
      setFirst(body?.firstName ?? "");
      setLast(body?.lastName ?? "");
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your name could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <>
        <dl className="settings-dl mt-3 text-[13.5px]">
          <dt className="text-ink-faint">First name</dt>
          <dd className="min-w-0 break-words">{firstName || <span className="text-ink-faint">Not set</span>}</dd>
          <dt className="text-ink-faint">Last name</dt>
          <dd className="min-w-0 break-words">{lastName || <span className="text-ink-faint">Not set</span>}</dd>
          <dt className="text-ink-faint">Email</dt>
          <dd className="truncate font-mono text-[12.5px]" title={email}>{email}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rt-btn"
            onClick={() => {
              setFirst(firstName);
              setLast(lastName);
              setSaved(false);
              setEditing(true);
            }}
          >
            {firstName || lastName ? "Edit name" : "Add your name"}
          </button>
          <p role="status" className="text-[12.5px] text-ok">{saved ? "Saved." : ""}</p>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3" aria-label="Edit your name">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { id: "first-name", label: "First name", value: first, set: setFirst, auto: "given-name" },
          { id: "last-name", label: "Last name", value: last, set: setLast, auto: "family-name" },
        ].map((field, index) => (
          <label key={field.id} htmlFor={field.id} className="grid gap-1 text-[12.5px] text-ink-dim">
            {field.label}
            <input
              id={field.id}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              maxLength={MAX}
              autoComplete={field.auto}
              autoFocus={index === 0}
              className="h-10 w-full min-w-0 border border-line-strong bg-raised px-3 text-[14px] text-ink outline-none focus:border-thread"
            />
          </label>
        ))}
      </div>
      <p className="text-[12px] text-ink-faint">Up to {MAX} characters each. Leave a box empty to clear it.</p>
      {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="rt-btn rt-btn-ghost" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>
          Cancel
        </button>
        <button type="submit" className="rt-btn rt-btn-ink" disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </form>
  );
}
