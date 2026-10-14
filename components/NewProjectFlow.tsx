"use client";

import Link from "next/link";
import { useState } from "react";
import { HomeMark } from "@/components/BrandMark";
import { ACCEPT, extractText, uploadOriginal, type Extracted } from "@/lib/ingest-client";
import { MAX_SOURCE_FILES } from "@/lib/sources";

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

// A real, checkable question with a public authoritative source (root-servers.org).
// The app never states the answer itself; the models find it and Daedalus checks it.
const SAMPLE_GOAL = "How many DNS root server instances are in Canada?";
const SAMPLE_DETAILS =
  "Give the current count of root server instances located in Canada, which root servers (letters) they belong to, and the cities. Use root-servers.org as the authoritative source and give the date of the data.";

export function NewProjectFlow({ runsLeft, runsLimit }: { runsLeft: number; runsLimit: number }) {
  const [step, setStep] = useState<"describe" | "confirm">("describe");
  const [goal, setGoal] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = files.some((f) => f.state === "reading");
  const ready = files.filter((f) => f.state === "read" && f.out);

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

  function toConfirm() {
    setBrief(draftBrief(goal, details, ready.map((f) => ({ name: f.name, words: f.out!.text.split(/\s+/).length }))));
    setStep("confirm");
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: goal.trim().slice(0, 120),
          brief,
          sources: ready.map((f) => ({ name: f.out!.name, mime: f.out!.mime, bytes: f.out!.bytes, text: f.out!.text })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; sourceIds?: string[] };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Could not create the project");
      const projectId = body.id;
      await Promise.all((body.sourceIds ?? []).map((sid, i) => uploadOriginal(projectId, sid, ready[i].out!.file)));
      window.location.href = `/p/${body.id}`;
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const field = "mt-1 w-full bg-raised px-3 py-2 text-[15px] leading-normal ring-1 ring-line focus:ring-thread";
  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <HomeMark />
        <Link href="/dashboard" className="text-sm text-ink-dim hover:text-ink">
          My projects
        </Link>
      </div>
      <h1 className="mt-4 font-serif text-[40px] leading-none tracking-[-0.015em]">{step === "describe" ? "What do you need fact-checked?" : "Check the brief"}</h1>
      <ol className="mt-3 flex gap-3 text-xs text-ink-dim">
        <li className={step === "describe" ? "text-thread" : ""}>1 Describe or upload</li>
        <li className={step === "confirm" ? "text-thread" : ""}>2 Confirm brief</li>
        <li>3 Run in the workspace</li>
      </ol>

      {step === "describe" ? (
        <div className="mt-6 space-y-5">
          <p className="text-sm leading-normal text-ink-dim">
            Odysseus answers from your brief and files. When the draft looks right to you, Daedalus checks each claim against your files and the web. You judge only what it flags.
          </p>
          <div className="text-sm">
            <span className="text-ink-dim">Sample question: </span>
            <button
              type="button"
              className="text-thread underline-offset-2 hover:underline"
              onClick={() => {
                setGoal(SAMPLE_GOAL);
                setDetails(SAMPLE_DETAILS);
              }}
            >
              {SAMPLE_GOAL}
            </button>
          </div>
          <label className="block text-sm">
            Question or goal, in one line
            <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} placeholder="e.g. What sample size did Smith et al. (2024) use, and was there a control group?" className={field} />
          </label>
          <label className="block text-sm">
            Details (optional)
            <textarea rows={5} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={3500} placeholder="What the answer must cover, which sources count, what you already know." className={field} />
          </label>
          <div>
            <p className="text-sm">Files (optional): PDF, DOCX or Markdown, up to {MAX_SOURCE_FILES}</p>
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
            <p className="mt-2 text-xs leading-normal text-ink-faint">
              Text is read in your browser. The original file is kept for 3 days, then deleted; the text stays with the project. Reading a file is not checking it.
            </p>
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={!goal.trim() || reading} onClick={toConfirm} className="bg-thread px-4 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50">
              Draft the brief
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm leading-normal text-ink-dim">
            Odysseus answers and Daedalus fact-checks from this brief{ready.length ? ` and the text of ${ready.length} file${ready.length > 1 ? "s" : ""}` : ""}. Edit anything, then confirm.
          </p>
          <textarea rows={12} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} className={field} aria-label="Brief" />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setStep("describe")} className="text-sm text-ink-dim hover:text-ink">
              Back
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-dim">
                {runsLeft > 0 ? `${runsLeft} of ${runsLimit} ${runsLimit === 1 ? "project" : "projects"} left today. Creating the project runs nothing.` : "You have used today's project. You can still create this one now and run it after 00:00 UTC."}
              </span>
              <button type="button" disabled={saving || !brief.trim()} onClick={() => void create()} className="bg-thread px-4 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50">
                {saving ? "Creating…" : "Confirm brief"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
