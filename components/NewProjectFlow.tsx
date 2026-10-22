"use client";

import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { HELP_MAILTO } from "@/lib/help";
import { useState } from "react";
import { HomeMark } from "@/components/BrandMark";
import { ACCEPT, extractText, uploadOriginal, type Extracted } from "@/lib/ingest-client";
import { MAX_SOURCE_FILES } from "@/lib/sources";
import { looksLikeAnswer } from "@/lib/simplify";

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
 * The ask screen (Oct 22): one box. Type a question, or paste an answer to check; Ariadne
 * tells which it is (you can switch), and one "Check" button starts the whole run.
 */
export function NewProjectFlow({ quota }: { quota: StartQuota }) {
  const usedUp = quota.runsLeft <= 0;
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<"ask" | "check" | null>(null);
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [brief, setBrief] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode: "ask" | "check" = override ?? (looksLikeAnswer(input) ? "check" : "ask");
  const reading = files.some((f) => f.state === "reading");
  const ready = files.filter((f) => f.state === "read" && f.out);
  const goal = mode === "ask" ? input.trim() : question.trim();
  const autoBrief = mode === "check" ? pastedBrief(goal, input) : draftBrief(goal, details, ready.map((f) => ({ name: f.name, words: f.out!.text.split(/\s+/).length })));
  const canStart = !usedUp && !reading && !saving && (mode === "ask" ? input.trim().length >= 3 : input.trim().length >= 40);

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
      const first = (goal || input.trim().split(/\n/)[0] || "Answer to check").slice(0, 110);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mode === "check" && !goal ? `Check: ${first}` : first,
          brief: (brief ?? autoBrief).trim(),
          pasted: mode === "check" ? input.trim() : undefined,
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
  const why = usedUp ? "Today's runs are used. A new one is available at the reset." : reading ? "Wait until your files are read." : mode === "ask" ? "Type your question first." : "Paste at least a sentence or two to check.";
  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <HomeMark />
        <div className="flex items-center gap-4">
          <a href={HELP_MAILTO} className="text-sm text-ink-dim hover:text-ink">Help</a>
          <Link href="/dashboard" className="text-sm text-ink-dim hover:text-ink">My projects</Link>
        </div>
      </div>
      <h1 className="mt-6 font-serif text-[40px] leading-none tracking-[-0.015em]">What should we check?</h1>
      <p className="mt-3 text-sm leading-normal text-ink-dim">
        Type a question, or paste an answer from ChatGPT or anywhere else. The writer answers with sources, the fact-checker checks every key claim, and you only choose where a source says otherwise.
      </p>
      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="sr-only">Your question or the answer to check</span>
          <textarea
            rows={mode === "check" ? 9 : 3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={4000}
            autoFocus
            placeholder="e.g. How many DNS root server instances are located in Canada?  — or paste an answer here"
            className={field}
            data-testid="ask-box"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="mode-line">
          {input.trim() ? (
            <>
              <span className="text-ink-dim">Ariadne will</span>
              <span className="font-medium">{mode === "ask" ? "answer this question and fact-check the answer" : "fact-check this answer"}</span>
              <button type="button" className="text-thread underline-offset-2 hover:underline" data-testid="mode-switch" onClick={() => setOverride(mode === "ask" ? "check" : "ask")}>
                {mode === "ask" ? "No, it's an answer to check" : "No, it's a question"}
              </button>
            </>
          ) : (
            <>
              <span className="text-ink-dim">Try:</span>
              <button type="button" className="text-thread underline-offset-2 hover:underline" onClick={() => { setInput(SAMPLE_GOAL); setDetails(SAMPLE_DETAILS); setOverride(null); }}>
                {SAMPLE_GOAL}
              </button>
            </>
          )}
        </div>
        {mode === "check" ? (
          <label className="block text-sm">
            The question it answers (optional)
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} className={field} />
          </label>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-dim">More options: details, your own files, the brief</summary>
          <div className="mt-3 space-y-4">
            {mode === "ask" ? (
              <label className="block">
                Details (optional)
                <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={3500} placeholder="What the answer must cover, which sources count." className={field} />
              </label>
            ) : null}
            <div>
              <p>Your own files: PDF, DOCX or Markdown, up to {MAX_SOURCE_FILES}</p>
              <label className="mt-2 inline-block cursor-pointer bg-raised px-3 py-2 ring-1 ring-line hover:ring-thread">
                Choose files
                <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
              </label>
              <ul className="mt-2 space-y-1">
                {files.map((f) => (
                  <li key={f.key} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{f.name}</span>
                    <span className={f.state === "failed" ? "text-danger" : f.state === "read" ? "text-ok" : "text-ink-dim"}>{f.state === "reading" ? "Reading…" : f.state === "read" ? "Text read" : "Could not read"}</span>
                    {f.note ? <span className="text-xs text-ink-dim">{f.note}</span> : null}
                    <button type="button" className="text-xs text-ink-faint hover:text-danger" onClick={() => setFiles((p) => p.filter((r) => r.key !== f.key))}>Remove</button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-normal text-ink-faint">Text is read in your browser. The original file is kept for 3 days, then deleted.</p>
            </div>
            <div>
              <p>The brief the writer and fact-checker get</p>
              <textarea rows={6} value={brief ?? autoBrief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} className={field} aria-label="Brief" />
              {brief !== null ? <button type="button" className="mt-1 text-xs text-thread" onClick={() => setBrief(null)}>Reset to the automatic brief</button> : null}
            </div>
          </div>
        </details>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs text-ink-dim" data-testid="start-cost">
            {usedUp ? (
              <>No runs left today · resets at <LocalTime iso={quota.resetsAt} format="time" /></>
            ) : (
              `Uses 1 of your ${quota.runsPerDay} run${quota.runsPerDay === 1 ? "" : "s"} today (${quota.runsLeft} left). Rewrites inside it are included.`
            )}
          </span>
          <button type="button" disabled={!canStart} onClick={() => void create()} className="bg-thread px-5 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50" data-testid="start">
            {saving ? "Starting…" : "Check"}
          </button>
        </div>
        {!canStart && !saving ? <p className="text-right text-xs text-gate-ink" data-testid="why-disabled">{why}</p> : null}
      </div>
    </main>
  );
}
