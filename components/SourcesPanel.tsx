"use client";

import { useRef, useState } from "react";
import { ACCEPT, extractText, uploadOriginal, type Extracted } from "@/lib/ingest-client";
import { MAX_SOURCE_FILES } from "@/lib/sources";
import type { ActivityEventDTO } from "@/lib/types";
import type { SourceSummary } from "@/lib/workspace-server";

function fileType(name: string) {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  return ext === "MARKDOWN" ? "MD" : ext.slice(0, 4);
}

function size(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function time(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? "Today" : d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/** The "Deliverable:" line of the brief, when there is one (the /new flow writes it). */
export function deliverableLine(brief: string): string | null {
  const m = /^Deliverable:\s*(.+)$/im.exec(brief);
  return m ? m[1].trim() : null;
}

const card = "rounded-2xl bg-raised p-4 ring-1 ring-line shadow-[0_1px_2px_rgba(31,26,20,0.05)]";
const heading = "text-[13px] font-semibold text-ink";

export function SourcesPanel({
  projectId,
  name,
  brief,
  sources,
  events,
  locked,
  onChanged,
}: {
  projectId: string;
  name: string;
  brief: string;
  sources: SourceSummary[];
  events: ActivityEventDTO[];
  locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const words = sources.reduce((n, s) => n + s.words, 0);
  const deliverable = deliverableLine(brief);
  const timeline = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-8);

  async function saveBrief() {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: draft }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(body.error ?? "Could not save the brief");
    setEditing(false);
    await onChanged();
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const read: Extracted[] = [];
    for (const file of [...files]) {
      setStatus(`Reading ${file.name}…`);
      try {
        const out = await extractText(file);
        read.push(out);
        if (out.truncated) setError(`${file.name}: only the first part was kept (length limit).`);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    if (read.length) {
      setStatus("Saving extracted text…");
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: read.map(({ name, mime, bytes, text }) => ({ name, mime, bytes, text })) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sources?: { id: string }[] };
      if (!res.ok) setError(body.error ?? "Could not save the files");
      else {
        setStatus("Keeping the originals for 3 days…");
        await Promise.all((body.sources ?? []).map((s, i) => (read[i] ? uploadOriginal(projectId, s.id, read[i].file) : false)));
      }
      await onChanged();
    }
    setStatus(null);
    if (input.current) input.current.value = "";
  }

  async function remove(id: string) {
    await fetch(`/api/projects/${projectId}/sources?source=${encodeURIComponent(id)}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="space-y-3">
      <section className={card} aria-labelledby="ctx-h">
        <h2 id="ctx-h" className={heading}>Project Context</h2>
        {sources.length === 0 ? <p className="mt-2 text-[13px] text-ink-dim">No files added. Odysseus works from the brief alone.</p> : null}
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="flex gap-2.5 rounded-xl bg-panel p-2.5 ring-1 ring-line">
              <span className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md bg-thread-soft text-[10px] font-semibold text-thread-bright">{fileType(s.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium" title={s.name}>{s.name}</span>
                  {!locked ? (
                    <button type="button" onClick={() => void remove(s.id)} className="text-[11px] text-ink-faint hover:text-danger" aria-label={`Remove ${s.name}`}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-ink-dim">
                  {fileType(s.name)} · {size(s.bytes)} · {s.words.toLocaleString("en-US")} words
                </p>
                <p className="text-[11px] text-ok">✓ Text read · not checked</p>
                <p className="text-[11px] text-ink-faint">
                  {s.originalUntil ? (
                    <>
                      Original kept until {new Date(s.originalUntil).toLocaleDateString()} ·{" "}
                      <a className="text-thread" href={`/api/projects/${projectId}/sources/${s.id}/file`}>Download</a>
                    </>
                  ) : (
                    "Original not kept"
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {sources.length ? (
          <p className="mt-2 text-[12px] text-ink-dim">
            Extracted: {sources.length} file{sources.length > 1 ? "s" : ""} · {words.toLocaleString("en-US")} words, shared with every step.
          </p>
        ) : null}
        {!locked && sources.length < MAX_SOURCE_FILES ? (
          <label className="mt-2 inline-block cursor-pointer text-[13px] text-thread hover:text-thread-bright">
            + Add PDF, DOCX or Markdown
            <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
          </label>
        ) : null}
        {status ? <p className="mt-1 text-xs text-ink-dim" role="status">{status}</p> : null}
        <p className="mt-2 text-[11px] leading-normal text-ink-faint">Text is read in your browser. Originals are kept 3 days. Reading a file is not checking it.</p>
      </section>

      <section className={card} aria-labelledby="goal-h">
        <div className="flex items-baseline justify-between">
          <h2 id="goal-h" className={heading}>Project Goal</h2>
          {!editing ? (
            <button type="button" onClick={() => { setDraft(brief); setEditing(true); }} className="text-xs text-thread">
              Edit brief
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] leading-normal">{name}</p>
        {editing ? (
          <>
            <textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} className="mt-2 w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" aria-label="Brief" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-ink-dim">Cancel</button>
              <button type="button" onClick={() => void saveBrief()} className="rounded-lg bg-thread px-2.5 py-1 text-xs text-raised">Save brief</button>
            </div>
            <p className="text-[11px] text-ink-faint">Changes apply to the next run. Nothing runs now.</p>
          </>
        ) : (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-ink-dim">Full brief</summary>
            <p className="mt-1 text-[12px] leading-normal whitespace-pre-wrap text-ink-dim">{brief}</p>
          </details>
        )}
      </section>

      <section className={card} aria-labelledby="deliv-h">
        <h2 id="deliv-h" className={heading}>Deliverable</h2>
        <p className="mt-2 text-[13px] leading-normal text-ink-dim">{deliverable ?? "As described in the brief, tied off and approved by you."}</p>
      </section>

      <section className={card} aria-labelledby="tl-h">
        <h2 id="tl-h" className={heading}>Timeline</h2>
        {timeline.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-dim">Nothing has happened yet. Steps appear here as they run.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l border-line pl-4">
            {timeline.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute top-1 -left-[21px] h-2.5 w-2.5 rounded-full ring-2 ring-raised ${e.type === "approved" ? "bg-ok" : e.type === "error" || e.type === "failed" ? "bg-danger" : "bg-thread"}`} />
                <p className="line-clamp-2 text-[12px] leading-snug">{e.message}</p>
                <time className="text-[11px] text-ink-faint" dateTime={e.createdAt}>{time(e.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
