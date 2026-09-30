"use client";

import { useState } from "react";
import { groupDigits, type AgentTone, type PacketSection } from "@/lib/thread";

export function Monogram({ tone, size = 20, dim = false }: { tone: AgentTone; size?: number; dim?: boolean }) {
  return (
    <span
      aria-hidden
      className="monogram"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        background: tone.color,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {tone.initial}
    </span>
  );
}

export function ContextBar({
  sections,
  title,
  className = "",
}: {
  sections: PacketSection[];
  title: string;
  className?: string;
}) {
  const total = sections.reduce((sum, section) => sum + section.chars, 0);
  return (
    <div className={`rounded-xl border border-line bg-panel px-3.5 py-3 ${className}`}>
      <p className="flex justify-between gap-3 text-xs text-ink-dim">
        <span>{title}</span>
        <span className="font-mono tnum">{groupDigits(total)} chars</span>
      </p>
      <div
        className="my-2 flex h-2 gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label={sections.map((section) => `${section.legend} ${section.chars} characters`).join(", ")}
      >
        {sections.map((section) => (
          <i
            key={section.key}
            className="block min-w-[3px]"
            style={{ width: `${total ? (section.chars / total) * 100 : 0}%`, background: section.color }}
          />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-dim">
        {sections.map((section) => (
          <span key={section.key} className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-2 w-2 rounded-[2px]" style={{ background: section.color }} />
            {section.legend}
          </span>
        ))}
      </p>
    </div>
  );
}

export function PacketSections({ sections }: { sections: PacketSection[] }) {
  const max = Math.max(1, ...sections.map((section) => section.chars));
  const [open, setOpen] = useState<string | null>(sections.find((section) => section.kind === "input")?.key ?? null);
  return (
    <ol className="grid gap-2">
      {sections.map((section) => {
        const expanded = open === section.key;
        return (
          <li key={section.key} className="rounded-xl border border-line bg-raised">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : section.key)}
              className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 text-left"
            >
              <i aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: section.color }} />
              <span className="truncate text-[13px] font-semibold">{section.label}</span>
              <span className="font-mono text-[11px] text-ink-faint tnum">{groupDigits(section.chars)} chars</span>
              <span aria-hidden className="col-span-3 block h-1 overflow-hidden rounded bg-line/70">
                <span
                  className="block h-full rounded"
                  style={{ width: `${(section.chars / max) * 100}%`, background: section.color }}
                />
              </span>
            </button>
            {expanded ? (
              <pre className="max-h-72 overflow-auto border-t border-line px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
                {section.text || "Empty."}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
