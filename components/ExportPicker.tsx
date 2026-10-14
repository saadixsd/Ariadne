"use client";

import { useEffect, useRef, useState } from "react";
import { EXPORT_FORMATS, exportFilename, type ExportFormat, type ExportModel } from "@/lib/export-doc";

/**
 * Small format picker: PDF, Word, PowerPoint or Markdown. The file is built in the
 * browser (the format's library loads on demand) and downloaded directly.
 */
export function ExportPicker({ open, onClose, build, name }: { open: boolean; onClose: () => void; build: () => ExportModel; name: string }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button[data-format]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && dialog.current) {
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button[data-format]"));
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (i >= 0) {
          e.preventDefault();
          items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  async function pick(format: ExportFormat, ext: string) {
    setBusy(format);
    setError(null);
    try {
      const model = build();
      const { renderExport } = await import("@/lib/export-render");
      const blob = await renderExport(model, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(name, model.date, ext);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onClose();
    } catch {
      setError("That file could not be made. Try again, or pick another format.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        data-testid="export-picker"
        className="w-full max-w-sm rounded-t-2xl bg-raised p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl ring-1 ring-line sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="export-title" className="font-serif text-lg leading-tight">Download</h2>
            <p className="text-[13px] text-ink-dim">The answer with its sources, the fact-check and your decisions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md px-2 text-xl leading-none text-ink-dim hover:text-ink">
            ×
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                data-format={f.id}
                disabled={busy !== null}
                onClick={() => void pick(f.id, f.ext)}
                className="flex min-h-[64px] w-full flex-col items-start rounded-xl bg-canvas px-3 py-2 text-left ring-1 ring-line hover:ring-thread focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-thread disabled:opacity-60"
              >
                <span className="text-sm font-medium">
                  {f.label} <span className="text-ink-faint">.{f.ext}</span>
                </span>
                <span className="text-[12px] text-ink-dim">{busy === f.id ? "Preparing…" : f.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
