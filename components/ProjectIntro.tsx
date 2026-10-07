"use client";

import { useState } from "react";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";
import { ONE_LINER } from "@/lib/one-liner";

// First-run orientation: Draft → Challenge → Judge → Tie Off, before the blank box.
// Matches lib/starter-thread.ts and the landing wedge.
const HOW_IT_WORKS = [
  "Give us a task.",
  "Odysseus drafts the answer.",
  "Daedalus challenges it — claim by claim.",
  "You judge: keep, change, or intervene.",
  "Tie it off into Answer / Sources / Disagreements.",
] as const;

// A suggestion the user can take, never data: nothing is created until they press Continue.
const EXAMPLE = {
  name: "Montreal pre-seed AI investors",
  brief: "Research the 10 strongest pre-seed AI investors in Montreal and explain why each is a fit.",
} as const;

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
      window.location.href = `/dashboard?project=${encodeURIComponent(body.id)}`;
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
          {ONE_LINER}
        </p>
        <section aria-labelledby="how-title" data-orientation className="mt-6 rounded-2xl bg-panel/70 px-5 py-4 ring-1 ring-line">
          <h2 id="how-title" className="text-[13px] font-semibold tracking-[0.08em] text-ink-dim uppercase">
            How Ariadne works
          </h2>
          <ol className="mt-2.5 grid gap-1.5">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step} className="grid grid-cols-[1.4rem_minmax(0,1fr)] items-baseline text-[16px] leading-snug text-ink">
                <span className="font-serif text-[18px] text-thread" aria-hidden>
                  {index + 1}
                </span>
                <span>
                  <span className="sr-only">{index + 1}. </span>
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-dim" data-roster>
            Odysseus (Claude) drafts. Daedalus (GPT) challenges. You press each step; add the disputes you agree
            with to your note. No web search on the free plan — points without a source in the draft are Opinion.
          </p>
        </section>
        <label className="mt-8 block">
          <span className="text-[13px] text-ink-dim">Project name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_PROJECT_NAME_CHARS}
            autoFocus
            placeholder={`e.g. ${EXAMPLE.name}`}
            className="mt-2 w-full rounded-2xl bg-panel px-4 py-4 text-[17px] ring-1 ring-line placeholder:text-ink-dim/50"
            aria-label="Project name"
          />
        </label>
        <label className="mt-5 block">
          <span className="text-[15px] font-medium text-ink">What are you trying to figure out?</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={MAX_BRIEF_CHARS}
            placeholder={`e.g. ${EXAMPLE.brief}`}
            className="mt-2 min-h-36 w-full resize-none rounded-2xl bg-panel px-4 py-4 text-[17px] leading-relaxed ring-1 ring-line placeholder:text-ink-dim/50"
            aria-label="Project description"
          />
          <span className="mt-2 block text-[13px] leading-normal text-ink-dim">
            Say what you need to know or produce, who it&apos;s for, and what a good answer looks like.
          </span>
        </label>
        {!name && !description ? (
          <button
            type="button"
            onClick={() => {
              setName(EXAMPLE.name);
              setDescription(EXAMPLE.brief);
              setError(null);
            }}
            className="mt-2 text-[13px] font-medium text-thread underline decoration-1 underline-offset-[3px] hover:text-thread-bright"
          >
            Use the example
          </button>
        ) : null}
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
        <p className="mt-3 text-center text-[13px] leading-normal text-ink-dim">
          Nothing runs yet. Next you&apos;ll see the steps; press Run on step 1 when you&apos;re ready.
        </p>
      </form>
    </main>
  );
}
