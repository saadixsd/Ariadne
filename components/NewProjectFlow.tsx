"use client";

import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { HELP_MAILTO } from "@/lib/help";
import { useState } from "react";
import { HomeMark } from "@/components/BrandMark";
import { ACCEPT, extractText, uploadOriginal, type Extracted } from "@/lib/ingest-client";
import { MAX_SOURCE_FILES } from "@/lib/sources";

export type StartQuota = { runsLeft: number; runsPerDay: number; resetsAt: string; rerunsPerRun: number };

type FileRow = { key: string; name: string; state: "reading" | "read" | "failed"; note?: string; out?: Extracted };

/** No model involved: a starting brief from what you typed and which files you added. */
export function draftBrief(goal: string, details: string, files: { name: string; words: number }[]): string {
  const parts = [`Goal: ${goal.trim()}`];
  if (details.trim()) parts.push(`What I need:\n${details.trim()}`);
  if (files.length) {
    parts.push(
      `Use the attached sources (${files.map((f) => f.name).join(", ")}). Say which source supports each claim, and say plainly when a claim rests on no source.`,
    );
  }
  parts.push("Deliverable: a clear written answer I can check, with the reasoning or source for each claim and what is still uncertain.");
  return parts.join("\n\n");
}

/** Brief for "Check an answer": the pasted text rides in the brief too, so a redraft keeps it. */
export function pastedBrief(goal: string, pasted: string): string {
  return [
    `Goal: Fact-check this answer${goal.trim() ? ` to the question: ${goal.trim()}` : ""}.`,
    `The answer to check (pasted by the user, written elsewhere):\n${pasted.trim()}`,
    "Deliverable: the same answer, corrected where its sources say otherwise, with one source per key claim.",
  ]
    .join("\n\n")
    .slice(0, 5000);
}

// A real, checkable question with a public authoritative source (root-servers.org).
// The app never states the answer itself; the models find it and the fact-check checks it.
const SAMPLE_GOAL = "How many DNS root server instances are located in Canada?";
const SAMPLE_DETAILS =
  "Give the current count of root server instances located in Canada, which root servers (letters) they belong to, and the cities. Use root-servers.org as the authoritative source and give the date of the data.";

/**
 * The start screen (U7, O3): ask a question or paste an answer to check, see today's
 * limits next to Start, and go straight to the draft. The brief stays editable (here under
 * "Edit the brief", and at the top of the workspace) but is never a separate gate.
 */
export function NewProjectFlow({ quota }: { quota: StartQuota }) {
  const usedUp = quota.runsLeft <= 0;
  const [mode, setMode] = useState<"ask" | "check">("ask");
  const [goal, setGoal] = useState("");
  const [details, setDetails] = useState("");
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [brief, setBrief] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = files.some((f) => f.state === "reading");
  const ready = files.filter((f) => f.state === "read" && f.out);
  const autoBrief = mode === "check" ? pastedBrief(goal, pasted) : draftBrief(goal, details, ready.map((f) => ({ name: f.name, words: f.out!.text.split(/\s+/).length })));
  const canStart = !usedUp && !reading && !saving && (mode === "ask" ? Boolean(goal.trim()) : pasted.trim().length >= 40);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list].slice(0, MAX_SOURCE_FILES - files.length);
    const rows = picked.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, name: file.name, state: "reading" as const }));
    setFiles((prev) => [...prev, ...rows]);
    await Promise.all(
      picked.map(async (file, i) => {
        const key = rows[i].key;
        try {
          const out = await extractText(file);
          setFiles((prev) => prev.map((r) => (r.key === key ? { ...r, state: "read", out, note: out.truncated ? "Long file: only the first part was kept." : undefined } : r)));
        } catch (e) {
          setFiles((prev) => prev.map((r) => (r.key === key ? { ...r, state: "failed", note: (e as Error).message } : r)));
        }
      }),
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const first = (goal.trim() || pasted.trim().split(/\n/)[0] || "Answer to check").slice(0, 110);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mode === "check" && !goal.trim() ? `Check: ${first}` : first,
          brief: (brief ?? autoBrief).trim(),
          pasted: mode === "check" ? pasted.trim() : undefined,
          sources: ready.map((f) => ({ name: f.out!.name, mime: f.out!.mime, bytes: f.out!.bytes, text: f.out!.text })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; sourceIds?: string[] };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Could not start");
      const projectId = body.id;
      await Promise.all((body.sourceIds ?? []).map((sid, i) => uploadOriginal(projectId, sid, ready[i].out!.file)));
      window.location.href = `/p/${body.id}?start=1`;
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const field = "mt-1 w-full bg-raised px-3 py-2 text-[15px] leading-normal ring-1 ring-line focus:ring-thread";
  const tabCls = (on: boolean) => `px-3 py-1.5 text-sm ${on ? "bg-ink text-raised" : "bg-raised text-ink-dim ring-1 ring-line hover:text-ink"}`;
  const why = usedUp ? "Today's runs are used. A new one is available at the reset." : reading ? "Wait until your files are read." : mode === "ask" ? "Write your question first." : "Paste the answer to check first (at least a sentence or two).";
  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <HomeMark />
        <div className="flex items-center gap-4">
          <a href={HELP_MAILTO} className="text-sm text-ink-dim hover:text-ink">Help</a>
          <Link href="/dashboard" className="text-sm text-ink-dim hover:text-ink">My projects</Link>
        </div>
      </div>
      <div role="status" data-testid="daily-limit" className={`mt-4 rounded-lg px-4 py-3 text-sm leading-normal ring-1 ring-line ${usedUp ? "bg-tint" : "bg-panel"}`}>
        {usedUp ? (
          <p>
            <span className="font-medium">You have used today&apos;s {quota.runsPerDay === 1 ? "run" : `${quota.runsPerDay} runs`}.</span>{" "}
            <span className="text-ink-dim">
              A new one is available at <LocalTime iso={quota.resetsAt} format="time" /> your time. Your projects stay open and their steps still run. <Link href="/dashboard" className="text-thread">Open your projects</Link>
            </span>
          </p>
        ) : (
          <p>
            <span className="font-medium">
              {quota.runsLeft} of {quota.runsPerDay} run{quota.runsPerDay === 1 ? "" : "s"} left today
            </span>
            <span className="text-ink-dim">
              {" "}· resets at <LocalTime iso={quota.resetsAt} format="time" /> your time. One run is one question, from draft to final answer. Up to {quota.rerunsPerRun} redrafts or re-checks inside a run are included, and a step that fails never counts.
            </span>
          </p>
        )}
      </div>
      <h1 className="mt-5 font-serif text-[40px] leading-none tracking-[-0.015em]">{mode === "ask" ? "What do you need answered and fact-checked?" : "Paste an answer to fact-check"}</h1>
      <div className="mt-4 inline-flex gap-1" role="tablist" aria-label="Start with">
        <button type="button" role="tab" aria-selected={mode === "ask"} className={tabCls(mode === "ask")} onClick={() => setMode("ask")}>
          Ask a question
        </button>
        <button type="button" role="tab" aria-selected={mode === "check"} className={tabCls(mode === "check")} onClick={() => setMode("check")} data-testid="mode-check">
          Check an answer
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <p className="text-sm leading-normal text-ink-dim">
          {mode === "ask"
            ? "One model answers with a source for each claim. A second model checks every key claim against its source. You decide only the claims it flags, and the final answer is rewritten from your decisions and checked again."
            : "Paste an answer from ChatGPT or another AI, or your own paragraph. Ariadne checks every key claim against its sources, you decide the flagged ones, and you get a corrected answer with a claims table."}
        </p>
        {mode === "ask" ? (
          <div className="text-sm">
            <span className="text-ink-dim">Try: </span>
            <button type="button" className="text-thread underline-offset-2 hover:underline" onClick={() => { setGoal(SAMPLE_GOAL); setDetails(SAMPLE_DETAILS); }}>
              {SAMPLE_GOAL}
            </button>
          </div>
        ) : null}
        <label className="block text-sm">
          {mode === "ask" ? "Your question, in one line" : "The question it answers (optional)"}
          <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} placeholder="e.g. What sample size did Smith et al. (2024) use, and was there a control group?" className={field} />
        </label>
        {mode === "check" ? (
          <label className="block text-sm">
            The answer to check
            <textarea rows={9} value={pasted} onChange={(e) => setPasted(e.target.value)} maxLength={4000} placeholder="Paste the AI answer or your text here (up to 4,000 characters)." className={field} data-testid="pasted" />
            <span className="mt-1 block text-xs text-ink-faint">{pasted.length.toLocaleString("en-US")} / 4,000 characters</span>
          </label>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-dim">Add details (optional)</summary>
            <textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={3500} placeholder="What the answer must cover, which sources count, what you already know." className={field} />
          </details>
        )}
        <div>
          <p className="text-sm">Your own files (optional): PDF, DOCX or Markdown, up to {MAX_SOURCE_FILES}</p>
          <label className="mt-2 inline-block cursor-pointer bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread">
            Choose files
            <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
          </label>
          <ul className="mt-2 space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.key} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{f.name}</span>
                <span className={f.state === "failed" ? "text-danger" : f.state === "read" ? "text-ok" : "text-ink-dim"}>
                  {f.state === "reading" ? "Reading…" : f.state === "read" ? `Text read · ${f.out!.text.split(/\s+/).length.toLocaleString("en-US")} words` : "Could not read"}
                </span>
                {f.note ? <span className="text-xs text-ink-dim">{f.note}</span> : null}
                <button type="button" className="text-xs text-ink-faint hover:text-danger" onClick={() => setFiles((p) => p.filter((r) => r.key !== f.key))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-normal text-ink-faint">Text is read in your browser. The original file is kept for 3 days, then deleted; the text stays with the project.</p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-dim">Edit the brief the models get (optional)</summary>
          <textarea rows={8} value={brief ?? autoBrief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} className={field} aria-label="Brief" />
          {brief !== null ? <button type="button" className="mt-1 text-xs text-thread" onClick={() => setBrief(null)}>Reset to the automatic brief</button> : null}
        </details>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs text-ink-dim" data-testid="start-cost">
            {usedUp ? "No runs left today." : `Uses 1 of your ${quota.runsPerDay} run${quota.runsPerDay === 1 ? "" : "s"} today (${quota.runsLeft} left).`}
          </span>
          <button type="button" disabled={!canStart} onClick={() => void create()} className="bg-thread px-4 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50" data-testid="start">
            {saving ? "Starting…" : mode === "ask" ? "Start: write the draft" : "Start: fact-check it"}
          </button>
        </div>
        {!canStart && !saving ? <p className="text-right text-xs text-gate-ink" data-testid="why-disabled">{why}</p> : null}
      </div>
    </main>
  );
}
