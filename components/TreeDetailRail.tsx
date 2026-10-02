"use client";

import { useEffect, useRef, useState } from "react";
import { useClocks } from "@/components/use-now";
import { useVisualViewportBox } from "@/components/KnotPanel";
import { OutputView } from "@/components/OutputView";
import { ContextBar, PacketSections } from "@/components/ThreadBits";
import { changeNotesFor, orderedLineageTasks } from "@/lib/lineage";
import { socraticQuestion } from "@/lib/philosophy";
import type { TreeNode } from "@/lib/live-tree";
import { hideModelIds } from "@/lib/model-label";
import { taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  artifactPreview,
  carriedInto,
  durationSeconds,
  knotFor,
  modelTag,
  outputGist,
  reviewFlags,
  stepRange,
  stopwatch,
  threadState,
  failureReason,
} from "@/lib/thread";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

type Tab = "lineage" | "packet" | "brief" | "output";

function firstLine(task: TaskDTO, project: ProjectDTO) {
  const gist = outputGist(task, project.agents);
  if (!gist) return null;
  const text = gist.lead && gist.lead.endsWith(".") ? gist.rest.split(" · ")[0] : gist.lead ?? gist.rest;
  return text?.replace(/^Verdict:\s*/, "") || null;
}

function Lineage({ task, project, knot }: { task: TaskDTO; project: ProjectDTO; knot: boolean }) {
  const { clockShort } = useClocks();
  const ancestors = orderedLineageTasks(task.id, project.tasks).filter((item) => item.id !== task.id);
  const agent = agentOf(task, project.agents);
  const state = threadState(task, project.tasks);
  return (
    <ol className="relative grid gap-3 pl-[26px]">
      <span aria-hidden className="absolute top-2 bottom-[22px] left-[7px] w-0.5 rounded bg-thread" />
      {ancestors.map((item) => {
        const who = agentOf(item, project.agents)?.name ?? "Unassigned";
        const quote = firstLine(item, project);
        const spun = item.status === "done";
        return (
          <li key={item.id} className="relative">
            <span
              aria-hidden
              className={`absolute top-1 -left-6 h-3 w-3 rounded-full border-2 ${spun ? "border-thread bg-thread shadow-[inset_0_0_0_3px_var(--color-raised)]" : "border-thread-dim bg-raised"}`}
            />
            <p className="text-[13px]">
              <b className="font-semibold">
                {who} · {item.title}
              </b>
              <span className="ml-1.5 font-mono text-[11px] text-ink-faint tnum">
                {[clockShort(item.completedAt ?? item.startedAt), stopwatch(durationSeconds(item))].filter(Boolean).join(" · ")}
              </span>
            </p>
            {quote ? <q className="mt-[3px] block font-serif text-[15px] leading-[1.3] text-ink-dim italic">{quote}</q> : null}
          </li>
        );
      })}
      <li className="relative">
        <span
          aria-hidden
          className={`absolute top-1 -left-6 h-3 w-3 rounded-full border-2 ${
            knot ? "border-gate bg-gate shadow-[0_0_0_4px_rgba(201,138,18,.2)]" : state === "spun" ? "border-thread bg-thread" : "border-thread bg-raised"
          }`}
        />
        <p className="text-[13px]">
          <b className="font-semibold">{knot ? "You · decide" : `${agent?.name ?? "Unassigned"} · this step`}</b>
          <span className="ml-1.5 font-mono text-[11px] text-ink-faint">{knot ? "now" : state}</span>
        </p>
      </li>
    </ol>
  );
}

function KnotFoot({
  task,
  project,
  onDecide,
}: {
  task: TaskDTO;
  project: ProjectDTO;
  onDecide: (approved: boolean, note: string) => Promise<void>;
}) {
  const knot = knotFor(task, project);
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const unlock = knot.unlocks[0];
  const rewinds = knot.resets.filter((item) => item.id !== task.id);

  async function submit(approved: boolean) {
    if (!approved && note.trim().length === 0) {
      setWriting(true);
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    setBusy(approved ? "approve" : "changes");
    try {
      await onDecide(approved, note);
    } finally {
      setBusy(null);
    }
  }

  const question = socraticQuestion(task.id, changeNotesFor(task.id, project).length);
  return (
    <div className="grid gap-2.5 border-t border-gate-line/60 bg-gate-bg/40 px-[22px] pt-3.5 pb-[18px]">
      <p className="font-serif text-[17px] leading-snug text-gate-ink italic" data-socratic>
        Before you tie off: {question}
      </p>
      {writing ? (
        <label className="block rounded-[10px] border border-dashed border-line-strong px-3 py-2 focus-within:border-thread">
          <span className="sr-only">What should change?</span>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="What should change?"
            className="w-full resize-none bg-transparent text-[13px] leading-normal outline-none placeholder:text-ink-faint"
          />
          <span className="block font-mono text-[11px] text-ink-faint">
            {rewinds.length > 0
              ? `↺ resets ${stepRange(rewinds, project.tasks)} · your note carries into ${stepRange(knot.rerunFirst, project.tasks)}`
              : "↺ sends this step back with your note"}
          </span>
        </label>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void submit(true)} className="rt-btn rt-btn-knot h-10 flex-1 text-sm">
          {busy === "approve" ? "Tying off…" : "Tie off (Approve)"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void submit(false)} className="rt-btn h-10 text-sm">
          {busy === "changes" ? "Sending back…" : writing ? "Send it back" : "Ask for changes"}
        </button>
      </div>
      <p className="text-xs text-ink-faint">
        {unlock
          ? `↳ Unlocks ${String(taskNumber(unlock.id, project.tasks)).padStart(2, "0")} · ${unlock.title} (${agentOf(unlock, project.agents)?.name ?? "next step"}). No model is called until you press Run.`
          : "↳ Tying off marks this step done. No model is called."}
      </p>
    </div>
  );
}

export function TreeDetailRail({
  project,
  node,
  authorName,
  pendingId,
  onClose,
  onRun,
  onRerun,
  onDecide,
  onEditBrief,
}: {
  project: ProjectDTO;
  node: TreeNode;
  authorName: string;
  pendingId: string | null;
  onClose: () => void;
  onRun: (taskId: string) => void;
  onRerun: (taskId: string) => void;
  onDecide: (approved: boolean, note: string) => Promise<void>;
  /** Opens the same brief editor the Board uses. */
  onEditBrief?: () => void;
}) {
  const { clock } = useClocks();
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  // Below lg the rail is a full-screen sheet (globals.css .tree-rail); this keeps its
  // pinned footer above the phone keyboard, the same way the board's knot sheet does.
  useVisualViewportBox(railRef, true);
  const sink = [...project.tasks].reverse().find((task) => !project.tasks.some((other) => other.dependsOn.includes(task.id))) ?? project.tasks.at(-1);
  const taskId = node.kind === "output" ? sink?.id : node.taskId;
  const task = project.tasks.find((item) => item.id === taskId) ?? null;
  const isRoot = node.kind === "root";
  const isOutput = node.kind === "output";
  const knot = !isOutput && task?.status === "awaiting_approval";
  const [tab, setTab] = useState<Tab>(isRoot ? "brief" : isOutput ? "output" : "lineage");
  const busy = task !== null && (pendingId === task.id || task.status === "running");

  useEffect(() => {
    closeRef.current?.focus();
  }, [node.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const agents = project.agents;
  const agent = agentOf(task ?? undefined, agents);
  const tone = agentTone(agent, agents);
  const number = task ? taskNumber(task.id, project.tasks) : 0;
  const state = task ? threadState(task, project.tasks, pendingId) : null;
  const carried = task ? carriedInto(task, project) : null;
  const knotInfo = knot && task ? knotFor(task, project) : null;
  const preview = knotInfo ? artifactPreview(knotInfo.artifact, agents) : null;
  const flags = knotInfo ? reviewFlags(knotInfo.reviewers, agents) : null;
  const inputNames = knotInfo ? [...new Set(knotInfo.inputs.map((input) => input.agent?.name ?? ""))].filter(Boolean) : [];

  const eyebrow = isRoot
    ? "The door · brief"
    : isOutput
      ? "The centre · deliverable"
      : knot
        ? "● The knot · waiting on you"
        : `Step ${String(number).padStart(2, "0")} · ${state === "knot" ? "the knot" : state}`;
  const title = isRoot ? project.name : isOutput ? (sink?.title ?? "No output yet") : (task?.title ?? node.label);
  const sub = isRoot
    ? `${authorName ? `Written by ${authorName}` : "Written by you"}${clock(project.createdAt) ? ` · ${clock(project.createdAt)}` : ""} · every agent reads it first.`
    : knot && knotInfo
      ? `Opened ${clock(knotInfo.openedAt) ?? "just now"} · everything ${inputNames.length > 0 ? inputNames.join(" and ") : "upstream"} spun reaches you here.`
      : task
        ? [tone.name, modelTag(task, agents), stopwatch(durationSeconds(task)), task.completedAt ? `finished ${clock(task.completedAt)}` : null]
            .filter(Boolean)
            .join(" · ")
        : "";
  const tabs: { id: Tab; label: string }[] = isRoot
    ? []
    : isOutput
      ? [
          { id: "output", label: "Deliverable" },
          { id: "lineage", label: "Lineage" },
          { id: "packet", label: "Packet" },
        ]
      : [
          { id: "lineage", label: "Lineage" },
          { id: "packet", label: "Packet" },
          { id: "brief", label: "Brief" },
        ];

  return (
    <aside
      ref={railRef}
      aria-labelledby="tree-detail-title"
      data-tree-rail
      className="tree-rail flex min-h-0 flex-col overflow-hidden border-l border-line bg-raised shadow-[-20px_0_40px_-30px_rgba(31,26,20,.25)]"
    >
      <div className={`border-b border-line px-[22px] pt-[18px] pb-3.5 ${knot ? "bg-[linear-gradient(180deg,#fcf1d6,var(--color-raised))]" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <p className={`eyebrow ${knot ? "text-gate-ink" : state === "frayed" ? "text-danger" : ""}`}>{eyebrow}</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="rt-btn rt-btn-ghost h-[26px] px-2">
            Esc ✕
          </button>
        </div>
        <h2 id="tree-detail-title" className="mt-1.5 font-serif text-[32px] leading-[1.05]">
          {title}
        </h2>
        {sub ? <p className="mt-1 text-[13px] text-ink-dim">{sub}</p> : null}
      </div>
      {tabs.length > 0 ? (
        <div role="tablist" aria-label="Detail views" className="flex gap-[18px] border-b border-line px-[22px]">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="tree-detail-panel"
              id={`tree-tab-${item.id}`}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                const index = tabs.findIndex((entry) => entry.id === tab);
                const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                setTab(next.id);
                requestAnimationFrame(() => document.getElementById(`tree-tab-${next.id}`)?.focus());
              }}
              tabIndex={tab === item.id ? 0 : -1}
              className={`-mb-px rounded-none border-b-2 pt-2.5 pb-[9px] text-[13px] font-[560] ${
                tab === item.id ? "border-thread text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div id="tree-detail-panel" role={tabs.length > 0 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 0 ? `tree-tab-${tab}` : undefined} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-3.5 overflow-x-hidden overflow-y-auto px-[22px] py-4">
        {tab === "brief" && onEditBrief ? (
          <p className="flex items-center justify-between gap-3 text-[12.5px] text-ink-faint">
            <span>{project.brief.trim() ? `${project.brief.trim().length.toLocaleString("en-US")} characters · every agent reads it first` : "Every agent reads it before it works."}</span>
            <button type="button" onClick={onEditBrief} className="rt-btn h-[28px] shrink-0 px-2.5">
              Edit brief
            </button>
          </p>
        ) : null}
        {tab === "brief" ? (
          project.brief.trim() ? (
            <blockquote className="rounded-xl border border-line bg-panel px-4 py-3.5 font-serif text-[17px] leading-[1.5] break-words whitespace-pre-line text-ink">
              {project.brief.trim()}
            </blockquote>
          ) : (
            <p className="text-sm text-ink-dim">No brief yet.</p>
          )
        ) : null}
        {tab === "output" ? (
          task?.output && task.status === "done" ? (
            <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
              <OutputView output={task.output} />
            </div>
          ) : (
            <p className="text-sm leading-normal text-ink-dim">
              Not woven yet. {sink ? `It appears here when ${agentOf(sink, agents)?.name ?? "the last step"} finishes “${sink.title}”.` : ""}
            </p>
          )
        ) : null}
        {tab === "lineage" && task && carried ? (
          <>
            <Lineage task={task} project={project} knot={knot} />
            <ContextBar
              sections={carried.sections}
              title={knot ? "Context carried to you" : carried.handed ? `Context carried to ${tone.name}` : `Context ${tone.name} will receive`}
            />
            {knot && preview ? (
              <div className="rounded-xl border border-gate-line/70 bg-raised px-3.5 py-3">
                <p className="eyebrow mb-1 text-[10px]">What you&apos;re judging · {preview.eyebrow}</p>
                {knotInfo?.artifact?.output ? <OutputView output={knotInfo.artifact.output} /> : <p className="mt-1.5 font-serif text-2xl leading-[1.05]">{preview.title}</p>}
                {flags && flags.flags.length > 0 ? (
                  <p className="mt-1.5 text-[12.5px] text-ink-dim">
                    ⚑ {flags.reviewer} noted: {flags.flags.slice(0, 2).map((flag) => flag.split(/[.;—]/)[0].trim()).join("; ")}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {!knot && !isOutput && task.status === "failed" ? (
              <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 font-mono text-[12px] text-danger">
                {hideModelIds(failureReason(task.id, project.events) ?? "This run failed.")}
              </p>
            ) : null}
            {!knot && !isOutput && task.output ? (
              <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
                <p className="eyebrow -mb-6 text-[10px]">Output</p>
                <OutputView output={task.output} />
              </div>
            ) : null}
          </>
        ) : null}
        {tab === "packet" && carried ? (
          <>
            <p className="text-[13px] leading-normal text-ink-dim">
              {carried.human
                ? "The door (your brief), then every finished step upstream, as it was packaged for you."
                : `The prompt ${tone.name} ${carried.handed ? "received" : "will receive"}: shared brief, upstream handoffs, then the step instructions.`}
            </p>
            <PacketSections key={task?.id} sections={carried.sections} />
          </>
        ) : null}
      </div>
      {knot && task ? <KnotFoot key={task.id} task={task} project={project} onDecide={onDecide} /> : null}
      {task && !knot && !isOutput && task.status !== "awaiting_approval" ? (
        <div className="flex justify-end gap-2 border-t border-line px-[22px] pt-3.5 pb-[18px]">
          {task.status === "done" ? (
            <button type="button" onClick={() => onRerun(task.id)} className="rt-btn h-10 text-sm">
              Rerun
            </button>
          ) : (
            <button
              type="button"
              disabled={!node.runnable || busy}
              onClick={() => onRun(task.id)}
              className="rt-btn rt-btn-thread h-10 text-sm"
            >
              {busy ? "Spinning…" : task.status === "failed" ? "Respin" : agent?.provider === "human" ? "Open the knot" : "Run"}
            </button>
          )}
        </div>
      ) : null}
    </aside>
  );
}
