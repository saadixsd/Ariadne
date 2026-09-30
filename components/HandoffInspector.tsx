"use client";

import { useEffect, useRef, useState } from "react";
import { useClocks } from "@/components/use-now";
import { ContextBar, PacketSections } from "@/components/ThreadBits";
import { agentOf, type Carried } from "@/lib/thread";
import type { ProjectDTO } from "@/lib/types";

/** The full context a step was (or will be) handed: the assembled packet, section by section. */
export function HandoffInspector({
  carried,
  project,
  onClose,
}: {
  carried: Carried;
  project: ProjectDTO;
  onClose: () => void;
}) {
  const { clock } = useClocks();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const to = carried.human ? "You" : (carried.targetAgent?.name ?? "This step");
  const from = [...new Set(carried.arrived.map((item) => agentOf(item, project.agents)?.name ?? "Unassigned"))];
  const at = clock(carried.handoffAt);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(carried.packet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-title"
        className="enter flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-raised"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line px-6 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">
              Context carried{from.length > 0 ? ` · ${from.join(" + ")} → ${to}` : ` · → ${to}`}
              {at ? ` · ${at}` : ""}
            </p>
            <button ref={closeRef} type="button" onClick={onClose} className="rt-btn rt-btn-ghost h-7 px-2" aria-label="Close handoff">
              Esc ✕
            </button>
          </div>
          <h2 id="handoff-title" className="mt-1.5 font-serif text-[30px] leading-[1.05]">
            {carried.handed ? `What ${to === "You" ? "you were" : `${to} was`} handed` : `What ${to === "You" ? "you" : to} will be handed`}
          </h2>
          <p className="mt-1 text-[13px] text-ink-dim">
            {carried.human
              ? "Every finished step upstream of this knot, packaged for your decision. No model is called."
              : `The exact prompt ${to} receives for “${carried.target.title}”: the shared brief, what upstream steps handed over, then the step's instructions.`}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <ContextBar sections={carried.sections} title={carried.handed ? "Context carried" : "Context that will be carried"} />
          <PacketSections sections={carried.sections} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3">
          <p className="text-xs text-ink-faint">{copied ? "Copied the full packet." : "Read-only. Nothing here calls Claude or GPT."}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void copy()} className="rt-btn" disabled={!carried.packet}>
              Copy packet
            </button>
            <button type="button" onClick={onClose} className="rt-btn rt-btn-ink">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
