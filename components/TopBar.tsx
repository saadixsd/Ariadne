"use client";

import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ViewSwitch } from "@/components/ViewSwitch";
import { DAILY_MODEL_RUNS } from "@/lib/limits";
import { newProjectHref } from "@/lib/new-project";

const MANAGE = "__manage_projects__";
const NEW = "__new_project__";

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
  onNewProject,
  runsLeft,
  children,
}: {
  view: "board" | "tree";
  projectId: string;
  projects: { id: string; name: string }[];
  onSwitchProject: (id: string) => void;
  /** Opens the new-project dialog in place; without it, the button goes to the board and opens it there. */
  onNewProject?: () => void;
  runsLeft: number;
  children?: ReactNode;
}) {
  const startNew = () => {
    if (onNewProject) onNewProject();
    else window.location.assign(newProjectHref(projectId));
  };
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
            if (event.target.value === NEW) {
              // Keep showing the current project; the dialog decides whether we switch.
              event.target.value = projectId;
              startNew();
              return;
            }
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
          <option value={NEW}>＋ New project…</option>
          <option value={MANAGE}>Manage projects…</option>
        </select>
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-[11px] text-ink-faint">
          ▾
        </span>
      </label>
      <button
        type="button"
        onClick={startNew}
        data-new-project
        aria-label="New project"
        title="Start a new project"
        className="rt-btn rt-btn-ghost shrink-0 px-2.5 max-sm:w-8 max-sm:border-line-strong max-sm:bg-raised max-sm:px-0"
      >
        <span aria-hidden>＋</span>
        <span className="max-sm:hidden">New project</span>
      </button>
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
