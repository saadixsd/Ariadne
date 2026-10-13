"use client";

import { useRef, useState } from "react";
import { ACCEPT, extractText, uploadOriginal, type Extracted } from "@/lib/ingest-client";
import { MAX_SOURCE_FILES } from "@/lib/sources";
import type { SourceSummary } from "@/lib/workspace-server";

export function SourcesPanel({
  projectId,
  name,
  brief,
  sources,
  locked,
  onChanged,
}: {
  projectId: string;
  name: string;
  brief: string;
  sources: SourceSummary[];
  locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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

  const label = "text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase";
  return (
    <div className="space-y-5">
      <section>
        <h2 className={label}>Goal</h2>
        <p className="mt-1 font-serif text-[22px] leading-tight">{name}</p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className={label}>Sources</h2>
          <span className="text-xs text-ink-faint">
            {sources.length}/{MAX_SOURCE_FILES}
          </span>
        </div>
        {sources.length === 0 ? <p className="mt-1 text-sm text-ink-dim">No files. Odysseus works from the brief alone.</p> : null}
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="bg-raised p-2 text-sm ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium" title={s.name}>
                  {s.name}
                </span>
                {!locked ? (
                  <button type="button" onClick={() => void remove(s.id)} className="text-xs text-ink-faint hover:text-danger">
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-ok">Text read · {s.words.toLocaleString("en-US")} words · not checked</p>
              <p className="text-xs text-ink-faint">
                {s.originalUntil ? (
                  <>
                    Original kept until {new Date(s.originalUntil).toLocaleDateString()} ·{" "}
                    <a className="text-thread" href={`/api/projects/${projectId}/sources/${s.id}/file`}>
                      Download
                    </a>
                  </>
                ) : (
                  "Original not kept (3-day limit passed or storage off)"
                )}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-normal text-ink-dim">{s.opening}</p>
            </li>
          ))}
        </ul>
        {!locked && sources.length < MAX_SOURCE_FILES ? (
          <label className="mt-2 inline-block cursor-pointer text-sm text-thread hover:text-thread-bright">
            + Add PDF, DOCX or Markdown
            <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
          </label>
        ) : null}
        {status ? <p className="mt-1 text-xs text-ink-dim" role="status">{status}</p> : null}
        <p className="mt-2 text-xs leading-normal text-ink-faint">
          Text is read in your browser. The original file is kept for 3 days, then deleted; the text stays with the project. Reading a file is not checking it.
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className={label}>Brief</h2>
          {!editing ? (
            <button type="button" onClick={() => { setDraft(brief); setEditing(true); }} className="text-xs text-thread">
              Edit
            </button>
          ) : null}
        </div>
        {editing ? (
          <>
            <textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} className="mt-1 w-full bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-ink-dim">
                Cancel
              </button>
              <button type="button" onClick={() => void saveBrief()} className="bg-thread px-2 py-1 text-xs text-raised">
                Save brief
              </button>
            </div>
            <p className="text-xs text-ink-faint">Changes apply to the next run. Nothing runs now.</p>
          </>
        ) : (
          <p className="mt-1 text-sm leading-normal whitespace-pre-wrap text-ink">{brief}</p>
        )}
      </section>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
