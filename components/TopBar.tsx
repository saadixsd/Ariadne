"use client";

import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ViewSwitch } from "@/components/ViewSwitch";
import { DAILY_MODEL_RUNS } from "@/lib/limits";

const MANAGE = "__manage_projects__";

export function RunsMeter({ remaining }: { remaining: number }) {
  const ratio = Math.max(0, Math.min(1, remaining / DAILY_MODEL_RUNS));
  return (
    <p className="hidden shrink-0 items-center gap-2 font-mono text-xs whitespace-nowrap text-ink-dim lg:flex" title="Free agent runs left today">
      <span className="block h-1 w-16 overflow-hidden rounded bg-line" aria-hidden>
        <span className="block h-full bg-ink-dim" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="tnum">
        {remaining}/{DAILY_MODEL_RUNS} runs left<span className="max-xl:hidden"> today</span>
      </span>
    </p>
  );
}

export function TopBar({
  view,
  projectId,
  projects,
  onSwitchProject,
  runsLeft,
  children,
}: {
  view: "board" | "tree";
  projectId: string;
  projects: { id: string; name: string }[];
  onSwitchProject: (id: string) => void;
  runsLeft: number;
  children?: ReactNode;
}) {
  return (
    // One row at every width: the project name truncates and secondary controls fold
    // away before anything wraps, so the account button never drops to its own line.
    <header className="bar-safe relative z-30 flex min-h-14 flex-nowrap items-center gap-x-3 border-b border-line bg-raised/60 pb-2 backdrop-blur-md sm:gap-x-[18px]">
      <BrandMark className="shrink-0 max-sm:text-[0px]" />
      <label className="relative flex min-w-[4.75rem] shrink items-center">
        <span className="sr-only">Project</span>
        <select
          value={projectId}
          onChange={(event) => {
            if (event.target.value === MANAGE) {
              window.location.assign(`/settings?project=${encodeURIComponent(projectId)}#projects`);
              return;
            }
            onSwitchProject(event.target.value);
          }}
          className="w-full max-w-60 min-w-0 cursor-pointer appearance-none truncate bg-transparent py-1.5 pr-7 pl-2.5 text-sm font-[550] text-ink hover:bg-panel"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          <option disabled>──────────</option>
          <option value={MANAGE}>Manage projects…</option>
        </select>
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-[11px] text-ink-faint">
          ▾
        </span>
      </label>
      <div className="shrink-0">
        <ViewSwitch view={view} projectId={projectId} />
      </div>
      <div className="min-w-0 flex-1" />
      <RunsMeter remaining={runsLeft} />
      <a href={`/settings?project=${encodeURIComponent(projectId)}`} className="hidden min-h-10 shrink-0 items-center text-[13px] font-[550] text-ink-dim hover:text-ink lg:inline-flex">
        Settings
      </a>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}

export function AccountButton({
  initial,
  label,
  expanded,
  onClick,
}: {
  initial: string;
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup="menu"
      onClick={onClick}
      className="grid h-[30px] w-[30px] place-items-center rounded-full bg-ink text-xs font-semibold text-raised"
    >
      {initial}
    </button>
  );
}
