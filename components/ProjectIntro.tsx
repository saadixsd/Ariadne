"use client";

import { useState } from "react";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";

export function ProjectIntro() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const nextName = name.trim();
    const nextDescription = description.trim();
    if (!nextName || !nextDescription) {
      setError("Add a name and a short description.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName, brief: nextDescription }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; id?: string } | null;
      if (!response.ok || !body?.id) {
        setError(body?.error ?? "Could not start the project.");
        setSaving(false);
        return;
      }
      window.location.href = `/?project=${encodeURIComponent(body.id)}`;
    } catch {
      setError("Could not reach the server.");
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={(event) => void submit(event)} className="enter w-full max-w-md">
        <span className="block h-0.5 w-8 bg-thread" aria-hidden />
        <p className="mt-6 text-[13px] font-medium tracking-[0.22em] text-ink-dim">ARIADNE</p>
        <h1 className="mt-3 text-[2.75rem] font-semibold leading-[1.05] tracking-tight">What are you making?</h1>
        <p className="mt-4 font-serif text-[21px] leading-snug text-ink" data-one-liner>
          Ariadne removes the human middleware between AI agents.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-dim" data-roster>
          Odysseus (Claude) researches and reviews. Daedalus (GPT) drafts and builds. You judge.
        </p>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-dim">
          Name the project and describe it in a sentence or two. Both of them read it first.
        </p>
        <label className="mt-10 block">
          <span className="text-[13px] text-ink-dim">Project name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_PROJECT_NAME_CHARS}
            autoFocus
            placeholder="Name"
            className="mt-2 w-full rounded-2xl bg-panel px-4 py-4 text-[17px] ring-1 ring-line placeholder:text-ink-dim/50"
            aria-label="Project name"
          />
        </label>
        <label className="mt-5 block">
          <span className="text-[13px] text-ink-dim">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={MAX_BRIEF_CHARS}
            placeholder="e.g. Map Montreal pre-seed investors for my AI dev-tools startup — I need names, check sizes, and warm-intro paths."
            className="mt-2 min-h-36 w-full resize-none rounded-2xl bg-panel px-4 py-4 text-[17px] leading-relaxed ring-1 ring-line placeholder:text-ink-dim/50"
            aria-label="Project description"
          />
          <span className="mt-2 block text-[13px] leading-normal text-ink-dim">
            Tip: state the goal, who it&apos;s for, and what a good result looks like.
          </span>
        </label>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="mt-8 h-12 w-full rounded-full bg-thread text-[17px] font-medium text-raised disabled:opacity-50"
        >
          {saving ? "Starting" : "Continue"}
        </button>
      </form>
    </main>
  );
}
