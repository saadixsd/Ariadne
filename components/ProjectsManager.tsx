"use client";

import { isDeleteConfirmation } from "@/lib/simplify";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/components/use-now";

export type ManagedProject = { id: string; name: string; createdAt: string; done: number; total: number };

const MAX_NAME = 80;

function createdLabel(iso: string, hydrated: boolean) {
  if (!hydrated) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Settings → Projects: rename or delete the user's own projects. */
export function ProjectsManager({ projects, maxName = MAX_NAME }: { projects: ManagedProject[]; maxName?: number }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<ManagedProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  async function rename(project: ManagedProject) {
    const name = draft.trim();
    if (!name || name === project.name) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The project could not be renamed.");
      setRenaming(null);
      setMessage({ tone: "ok", text: `Renamed to “${name}”.` });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "danger", text: caught instanceof Error ? caught.message : "The project could not be renamed." });
    } finally {
      setBusy(false);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        No projects. <Link href="/new" className="font-[560] text-thread underline underline-offset-4">Start one</Link>.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {projects.map((project) => (
          <li key={project.id} className="project-row rounded-xl border border-line bg-panel px-3.5 py-3">
            {renaming === project.id ? (
              <form
                className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void rename(project);
                }}
              >
                <label className="min-w-0 flex-[1_1_14rem]">
                  <span className="sr-only">New name for {project.name}</span>
                  <input
                    autoFocus
                    value={draft}
                    maxLength={maxName}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="h-10 w-full border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-thread"
                  />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="rt-btn rt-btn-ghost" onClick={() => setRenaming(null)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="rt-btn rt-btn-ink" disabled={busy || !draft.trim()}>
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-[1_1_15rem]">
                  <a href={`/p/${encodeURIComponent(project.id)}`} className="touch-min block truncate font-serif text-[20px] leading-tight hover:text-thread" title={project.name}>
                    {project.name}
                  </a>
                  <p className="mt-0.5 font-mono text-[11.5px] text-ink-faint tnum">
                    {createdLabel(project.createdAt, hydrated) ? `Started ${createdLabel(project.createdAt, hydrated)} · ` : ""}
                    {project.done}/{project.total} {project.total === 1 ? "step" : "steps"} done
                  </p>
                  <span className="mt-1.5 flex h-1 max-w-48 gap-0.5" aria-hidden>
                    {Array.from({ length: Math.min(project.total, 24) }, (_, index) => (
                      <i key={index} className={`block h-full flex-1 rounded-sm ${index < project.done ? "bg-thread" : "bg-line"}`} />
                    ))}
                  </span>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="rt-btn rt-btn-ghost"
                    onClick={() => {
                      setDraft(project.name);
                      setMessage(null);
                      setRenaming(project.id);
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" className="rt-btn rt-btn-danger" onClick={() => { setMessage(null); setDeleting(project); }}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className={`mt-2 min-h-5 text-[12.5px] ${message?.tone === "danger" ? "text-danger" : "text-ok"}`}>
        {message?.text ?? ""}
      </p>
      {deleting ? (
        <DeleteDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(name) => {
            setDeleting(null);
            setMessage({ tone: "ok", text: `Deleted “${name}”.` });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function DeleteDialog({ project, onClose, onDeleted }: { project: ManagedProject; onClose: () => void; onDeleted: (name: string) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = isDeleteConfirmation(typed);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  async function confirm() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The project could not be deleted.");
      onDeleted(project.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-safe modal-flush fixed inset-0 z-50 flex items-end justify-center bg-ink/35 sm:items-center" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
        className="w-full max-w-md rounded-t-2xl bg-raised p-5 ring-1 ring-danger/40 sm:rounded-2xl"
      >
        <p className="eyebrow text-danger">Delete project</p>
        <h2 id="delete-title" className="mt-1 font-serif text-[26px] leading-tight break-words">
          Delete “{project.name}”?
        </h2>
        <p id="delete-body" className="mt-2 text-[13.5px] leading-normal text-ink-dim">
          Its {project.total} {project.total === 1 ? "step" : "steps"}, every output, run and its history go with it. This cannot be undone. Today&apos;s run count does not change.
        </p>
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <label htmlFor="delete-confirm" className="text-[12.5px] text-ink-dim">
            Type <b className="font-semibold text-ink">delete</b> to confirm
          </label>
          <input
            id="delete-confirm"
            ref={inputRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="delete"
            aria-describedby="delete-body"
            className="h-10 w-full border border-line-strong bg-canvas px-3 text-[14px] outline-none focus:border-danger"
          />
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" className="rt-btn rt-btn-ghost" onClick={onClose} disabled={busy}>
              Keep it
            </button>
            <button type="submit" className="rt-btn rt-btn-danger-solid" disabled={!matches || busy}>
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
