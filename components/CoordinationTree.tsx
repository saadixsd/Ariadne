"use client";

import { useEffect, useRef, useState } from "react";
import { Monogram } from "@/components/ThreadBits";
import { useNow } from "@/components/use-now";
import { taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  carriedInto,
  carriedNoun,
  charsLabel,
  inputChars,
  clockShort,
  durationSeconds,
  modelTag,
  objectOf,
  outputGist,
  since,
  stopwatch,
  threadState,
  type ThreadState,
} from "@/lib/thread";
import { pointAt, polylineLength, rectSpiral, roundedPath, slicePolyline } from "@/lib/tree-layout";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

const H = 780;
// Space kept clear under the spiral for the floating legend chip.
const LEGEND_ROOM = 40;
const RED = "var(--color-thread)";
const GRAPHITE = "var(--color-thread-dim)";
const MAX_SPIRAL_STEPS = 9;
const MIN_SPIRAL_WIDTH = 720;

type Segment = { id: string; d: string; kind: "spun" | "spinning" | "frayed" | "unspun" };

function stateLabel(state: ThreadState) {
  if (state === "spun") return "spun";
  if (state === "spinning") return "spinning";
  if (state === "knot") return "the knot";
  if (state === "frayed") return "frayed";
  if (state === "ready") return "ready";
  return "unspun";
}

function segmentKind(target: ThreadState | "centre", woven: boolean): Segment["kind"] {
  if (target === "centre") return woven ? "spun" : "unspun";
  if (target === "spun" || target === "knot") return "spun";
  if (target === "spinning") return "spinning";
  if (target === "frayed") return "frayed";
  return "unspun";
}

function arrow(dx: number, dy: number) {
  if (dx > 0) return "→";
  if (dx < 0) return "←";
  if (dy > 0) return "↓";
  return "↑";
}

function waitingSince(task: TaskDTO, project: ProjectDTO) {
  return (
    project.events
      .filter((event) => event.type === "approval_requested" && event.taskId === task.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)?.createdAt ?? task.startedAt
  );
}

function Clock({ task, state, project }: { task: TaskDTO; state: ThreadState; project: ProjectDTO }) {
  const now = useNow();
  if (state === "knot") return <span className="tnum">{stopwatch(since(waitingSince(task, project), now)) ?? ""}</span>;
  if (state === "spinning") return <span className="tnum text-thread">{stopwatch(since(task.startedAt, now)) ?? ""}</span>;
  if (state === "spun") return <span className="tnum">{stopwatch(durationSeconds(task)) ?? ""}</span>;
  if (state === "unspun") return <span>locked</span>;
  return null;
}

function StepCard({
  task,
  index,
  state,
  project,
  selected,
  onSelect,
  onHover,
}: {
  task: TaskDTO;
  index: number;
  state: ThreadState;
  project: ProjectDTO;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const agent = agentOf(task, project.agents);
  const tone = agentTone(agent, project.agents);
  const tag = modelTag(task, project.agents);
  const tones: Record<ThreadState, string> = {
    spun: "border-line bg-raised shadow-[0_1px_0_rgba(31,26,20,.04),0_6px_18px_-8px_rgba(31,26,20,.18)]",
    spinning: "border-thread/50 bg-raised shadow-[0_1px_0_rgba(31,26,20,.04),0_6px_18px_-8px_rgba(31,26,20,.18)]",
    knot: "knot-breathe border-[#d9a441] bg-[linear-gradient(0deg,var(--color-gate-bg),#fdf6e4)] outline-2 outline-offset-[3px] outline-gate",
    frayed: "border-danger/40 bg-raised shadow-[0_6px_18px_-8px_rgba(31,26,20,.18)]",
    ready: "border-line-strong bg-raised shadow-[0_6px_18px_-8px_rgba(31,26,20,.18)]",
    unspun: "border-dashed border-line-strong bg-raised/60",
  };
  return (
    <button
      type="button"
      data-node-focus={task.id}
      data-node-id={task.id}
      onClick={() => onSelect(task.id)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(task.id)}
      onBlur={() => onHover(null)}
      aria-label={`Step ${index + 1}, ${task.title}, ${tone.name}, ${stateLabel(state)}. Open details.`}
      aria-pressed={selected}
      className={`block min-w-[190px] max-w-[250px] rounded-xl border px-3 pt-[9px] pb-2.5 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_0_rgba(31,26,20,.04),0_16px_28px_-12px_rgba(31,26,20,.3)] motion-reduce:hover:translate-y-0 ${tones[state]} ${
        selected && state !== "knot" ? "outline-2 outline-offset-[3px] outline-thread" : ""
      }`}
    >
      <span
        className={`flex justify-between gap-3 font-mono text-[10.5px] tracking-[0.06em] uppercase ${
          state === "knot" ? "text-gate-ink" : state === "frayed" ? "text-danger" : "text-ink-faint"
        }`}
      >
        <span>
          {String(index + 1).padStart(2, "0")} ·{" "}
          <b className={`font-medium ${state === "spun" || state === "spinning" ? "text-thread" : ""}`}>{stateLabel(state)}</b>
        </span>
        <Clock task={task} state={state} project={project} />
      </span>
      <span className={`mt-[3px] block truncate font-serif text-xl leading-[1.1] ${state === "unspun" ? "text-ink-faint" : "text-ink"}`}>
        {task.title}
      </span>
      <span className={`mt-[5px] flex items-center gap-1.5 text-xs ${state === "unspun" ? "text-ink-faint" : "text-ink-dim"}`}>
        <Monogram tone={tone} size={18} dim={state === "unspun"} />
        {tone.name}
        {state === "knot" ? <span className="font-mono text-[11px] text-gate-ink">· waiting</span> : null}
        {tag && state !== "knot" && state !== "unspun" ? <span className="font-mono text-[11px] text-ink-faint">{tag}</span> : null}
      </span>
    </button>
  );
}

function DoorCard({ project, selected, onSelect }: { project: ProjectDTO; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      data-node-focus="root"
      data-node-id="root"
      onClick={() => onSelect("root")}
      aria-label="The door: the project brief. Open details."
      aria-pressed={selected}
      className={`block w-[250px] rounded-xl border border-ink bg-ink px-3 pt-[9px] pb-2.5 text-left text-raised shadow-[0_6px_18px_-8px_rgba(31,26,20,.4)] transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
        selected ? "outline-2 outline-offset-[3px] outline-thread" : ""
      }`}
    >
      <span className="flex justify-between font-mono text-[10.5px] tracking-[0.06em] text-[#c9bba5] uppercase">
        <span>The door · brief</span>
        <span>{clockShort(project.createdAt)}</span>
      </span>
      <span className="mt-1 line-clamp-3 block font-serif text-[14.5px] leading-[1.3] text-[#ede5d6] italic">
        {project.brief.trim() ? `“${project.brief.trim()}”` : "No brief yet. Every agent reads it before it works."}
      </span>
    </button>
  );
}

function CentreCard({
  project,
  sink,
  woven,
  selected,
  onSelect,
}: {
  project: ProjectDTO;
  sink: TaskDTO | undefined;
  woven: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const agent = agentOf(sink, project.agents);
  const name = sink ? objectOf(sink.title) : "deliverable";
  return (
    <button
      type="button"
      data-node-focus="output"
      data-node-id="output"
      onClick={() => onSelect("output")}
      aria-label={`The centre: ${name}. ${woven ? "Woven. Open it." : "Not woven yet."}`}
      aria-pressed={selected}
      className={`block w-[250px] rounded-2xl px-3 py-3 text-center ${selected ? "outline-2 outline-offset-[3px] outline-thread" : ""}`}
    >
      <span
        aria-hidden
        className={`mx-auto grid h-[86px] w-[86px] place-items-center rounded-full border-[1.5px] bg-[radial-gradient(circle,var(--color-raised)_0_60%,transparent_61%)] ${
          woven ? "border-thread text-thread" : "border-dashed border-line-strong text-ink-faint"
        }`}
      >
        <span className="font-serif text-[30px]">✦</span>
      </span>
      <span className="mt-2 block font-serif text-[21px] leading-tight text-ink">The {name}</span>
      <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-faint">
        {woven
          ? `Woven by ${agent?.name ?? "the last step"} · open it`
          : sink
            ? `Not woven yet — appears here when ${agent?.name ?? "the last step"} finishes step ${taskNumber(sink.id, project.tasks)}.`
            : "Add steps on the Board. The deliverable appears here when the last one is spun."}
      </span>
    </button>
  );
}

function HoverCard({ task, index, project }: { task: TaskDTO; index: number; project: ProjectDTO }) {
  const agents = project.agents;
  const agent = agentOf(task, agents);
  const gist = outputGist(task, agents);
  const state = threadState(task, project.tasks);
  const tag = modelTag(task, agents);
  const carried = carriedInto(task, project);
  let line: string;
  if (state === "knot") line = `Waiting on you. ${carried.arrived.length} inputs reach you here, ${charsLabel(inputChars(carried))} in all.`;
  else if (state === "spinning") line = `${agent?.name ?? "The agent"} is working on it now.`;
  else if (state === "frayed") line = "The run failed. Open it to read the error and respin.";
  else if (state === "spun") line = gist ? [gist.lead, gist.rest].filter(Boolean).join(" ") : "Finished.";
  else if (state === "ready") line = "Ready. Nothing runs until you press Run.";
  else line = "Locked until the steps it needs are spun.";
  return (
    <div className="w-[300px] rounded-xl bg-ink px-3.5 py-3 text-[12.5px] leading-[1.4] text-[#f4eee3] shadow-[0_18px_40px_-16px_rgba(31,26,20,.6)]">
      <p className="flex justify-between font-mono text-[10.5px] tracking-[0.06em] text-[#c9bba5] uppercase">
        <span>Step {String(index + 1).padStart(2, "0")}</span>
        <span>{tag ?? agent?.name ?? ""}</span>
      </p>
      <p className="mt-1.5 line-clamp-3">{line}</p>
      <p className="mt-2 border-t border-white/10 pt-2 font-mono text-[11px] text-[#c9bba5]">Click to inspect · Enter opens the rail</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-[18px] left-7 z-10 flex flex-wrap items-center gap-3.5 rounded-full border border-line bg-raised/85 px-3.5 py-1.5 text-xs text-ink-dim backdrop-blur-sm">
      <em className="font-serif text-[15px] text-ink">The labyrinth</em>
      <span className="hidden text-ink-faint xl:inline">brief at the door, deliverable at the centre</span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 26 10" className="h-2.5 w-[26px]" aria-hidden>
          <path d="M1 5 H25" stroke={RED} strokeWidth="3" />
        </svg>
        spun
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 26 10" className="h-2.5 w-[26px]" aria-hidden>
          <path d="M1 5 H25" stroke={RED} strokeWidth="3" className="thread-spin" />
        </svg>
        spinning
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 26 10" className="h-2.5 w-[26px]" aria-hidden>
          <circle cx="13" cy="5" r="4.5" fill="var(--color-gate)" />
        </svg>
        knot · you
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 26 10" className="h-2.5 w-[26px]" aria-hidden>
          <path d="M1 5 H25" stroke={GRAPHITE} strokeWidth="2" strokeDasharray="2 4" />
        </svg>
        unspun
      </span>
    </div>
  );
}

/** Below ~720px or past nine steps the spiral gets cramped; unroll it into a vertical thread. */
function ThreadList({
  project,
  states,
  selectedId,
  sink,
  woven,
  onSelect,
}: {
  project: ProjectDTO;
  states: ThreadState[];
  selectedId: string | null;
  sink: TaskDTO | undefined;
  woven: boolean;
  onSelect: (id: string) => void;
}) {
  const [, setHover] = useState<string | null>(null);
  return (
    <ol className="mx-auto grid max-w-xl gap-0 px-6 pt-6 pb-24">
      <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
        <span aria-hidden className="relative flex justify-center">
          {project.tasks.length > 0 ? <span className="absolute top-6 bottom-0 w-[3px] rounded bg-thread" /> : null}
        </span>
        <div className="pb-5">
          <DoorCard project={project} selected={selectedId === "root"} onSelect={onSelect} />
        </div>
      </li>
      {project.tasks.map((task, index) => {
        const state = states[index];
        const line = state === "unspun" || state === "ready" ? "border-l-2 border-dashed border-thread-dim" : state === "frayed" ? "border-l-[3px] border-dashed border-danger" : "border-l-[3px] border-thread";
        return (
          <li key={task.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span aria-hidden className="relative flex justify-center">
              <span className={`absolute inset-y-0 ${line}`} />
              <span
                className={`relative mt-6 h-3.5 w-3.5 rounded-full border-2 ${
                  state === "knot" ? "border-gate bg-gate" : state === "spun" ? "border-thread bg-thread shadow-[inset_0_0_0_3px_var(--color-raised)]" : "border-thread-dim bg-raised"
                }`}
              />
            </span>
            <div className="pb-5">
              <StepCard task={task} index={index} state={state} project={project} selected={selectedId === task.id} onSelect={onSelect} onHover={setHover} />
            </div>
          </li>
        );
      })}
      <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
        <span aria-hidden />
        <div className="justify-self-start">
          <CentreCard project={project} sink={sink} woven={woven} selected={selectedId === "output"} onSelect={onSelect} />
        </div>
      </li>
    </ol>
  );
}

export function CoordinationTree({
  project,
  pendingId,
  selectedId,
  onSelect,
}: {
  project: ProjectDTO;
  pendingId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const tasks = project.tasks;
  const states = tasks.map((task) => threadState(task, tasks, pendingId));
  const sink = [...tasks].reverse().find((task) => !tasks.some((other) => other.dependsOn.includes(task.id))) ?? tasks.at(-1);
  const woven = !!sink && sink.status === "done" && !!sink.output;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const spiral = size.width >= MIN_SPIRAL_WIDTH && tasks.length > 0 && tasks.length <= MAX_SPIRAL_STEPS;
  const W = Math.round(Math.min(1500, Math.max(980, (H * size.width) / Math.max(1, size.height))));
  const fit = size.width && size.height ? Math.min(size.width / W, (size.height - 8) / H) : 1;
  const scale = fit * zoom;

  let content = null;
  if (spiral && size.width > 0) {
    const { points, centre } = rectSpiral(W, H - LEGEND_ROOM, {
      mx: 150,
      my: 76,
      gx: 250,
      gy: 172,
      minX: 230,
      minY: 150,
      centre: { halfW: 125, halfH: 78 },
    });
    const walls = rectSpiral(W, H - LEGEND_ROOM, {
      mx: 150 - 125,
      my: 76 - 86,
      gx: 250,
      gy: 172,
      minX: 230,
      minY: 150,
      centre: { halfW: 125, halfH: 78 },
    }).points;
    const total = polylineLength(points);
    const stops = [0, ...tasks.map((_, index) => (total * (index + 1)) / (tasks.length + 1)), total];
    const place = stops.map((s) => pointAt(points, s));
    const segments: Segment[] = [];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const target: ThreadState | "centre" = index < tasks.length ? states[index] : "centre";
      const previousSpun = index === 0 || states[index - 1] === "spun";
      const kind = previousSpun ? segmentKind(target, woven) : "unspun";
      segments.push({ id: `seg-${index}`, d: roundedPath(slicePolyline(points, stops[index], stops[index + 1]), 40), kind });
    }
    const firstUnspun = segments.findIndex((segment) => segment.kind === "unspun");
    const beads = segments.flatMap((segment, index) => {
      if (index === 0 || index >= tasks.length) return [];
      const task = tasks[index];
      const carried = carriedInto(task, project);
      const mid = pointAt(points, (stops[index] + stops[index + 1]) / 2);
      if (segment.kind === "unspun" && index !== firstUnspun) return [];
      const list = carried.handed ? carried.arrived : carried.sources;
      const what =
        list.length === 1
          ? carriedNoun(list[0], project.agents)
          : list.length === 0
            ? "brief"
            : `${list.length} inputs${carried.handed ? ` · ${charsLabel(inputChars(carried)).replace(" chars", "")}` : ""}`;
      return [{ id: task.id, x: mid.x, y: mid.y, text: `${what} ${arrow(mid.dx, mid.dy)}`, live: carried.handed }];
    });
    const knotIndex = states.indexOf("knot");
    const hoverIndex = hover ? tasks.findIndex((task) => task.id === hover) : -1;
    const hoverPlace = hoverIndex >= 0 ? place[hoverIndex + 1] : null;

    content = (
      <div className="h-full overflow-auto" data-tree-scroll>
        <div className="relative mx-auto" style={{ width: W * scale, height: H * scale }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
              <rect x={24} y={-26} width={W - 48} height={H + 4} rx={60} fill="none" stroke="#e6dccb" strokeWidth={6} strokeOpacity={0.5} />
              <path d={roundedPath(walls, 40)} fill="none" stroke="#d8cab3" strokeWidth={1.5} strokeLinecap="round" />
              {segments.map((segment) => (
                <path
                  key={`${segment.id}-${segment.kind}`}
                  d={segment.d}
                  fill="none"
                  strokeLinecap="round"
                  pathLength={segment.kind === "spun" ? 1 : undefined}
                  className={segment.kind === "spun" ? "thread-draw" : segment.kind === "spinning" ? "thread-spin" : undefined}
                  stroke={segment.kind === "unspun" ? GRAPHITE : segment.kind === "frayed" ? "var(--color-danger)" : RED}
                  strokeWidth={segment.kind === "unspun" ? 2 : 3}
                  strokeDasharray={segment.kind === "unspun" ? "2 6" : segment.kind === "frayed" ? "6 5 2 7" : undefined}
                />
              ))}
              {knotIndex >= 0 ? (
                <circle cx={place[knotIndex + 1].x} cy={place[knotIndex + 1].y} r={9} fill="var(--color-gate)" stroke="var(--color-raised)" strokeWidth={2} />
              ) : null}
            </svg>
            {beads.map((bead) => (
              <span
                key={bead.id}
                className={`absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 font-mono text-[11.5px] whitespace-nowrap ${
                  bead.live ? "border-thread-soft bg-raised text-thread" : "border-dashed border-line-strong bg-canvas text-ink-faint"
                }`}
                style={{ left: bead.x, top: bead.y }}
              >
                {bead.text}
              </span>
            ))}
            <div className="absolute z-[3] -translate-x-1/2 -translate-y-1/2" style={{ left: place[0].x, top: place[0].y }}>
              <DoorCard project={project} selected={selectedId === "root"} onSelect={onSelect} />
            </div>
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="absolute z-[3] -translate-x-1/2 -translate-y-1/2"
                style={{ left: place[index + 1].x, top: place[index + 1].y }}
              >
                <StepCard
                  task={task}
                  index={index}
                  state={states[index]}
                  project={project}
                  selected={selectedId === task.id}
                  onSelect={onSelect}
                  onHover={setHover}
                />
              </div>
            ))}
            <div className="absolute z-[2] -translate-x-1/2 -translate-y-1/2" style={{ left: centre.x, top: centre.y }}>
              <CentreCard project={project} sink={sink} woven={woven} selected={selectedId === "output"} onSelect={onSelect} />
            </div>
            {hover && hoverPlace && hoverIndex >= 0 ? (
              <div
                className="pointer-events-none absolute z-[6]"
                style={{
                  left: Math.min(W - 160, Math.max(160, hoverPlace.x)),
                  top: hoverPlace.y > H - 190 ? hoverPlace.y - 50 : hoverPlace.y + 48,
                  transform: `translate(-50%, ${hoverPlace.y > H - 190 ? "-100%" : "0"})`,
                }}
              >
                <HoverCard task={tasks[hoverIndex]} index={hoverIndex} project={project} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  } else if (size.width > 0) {
    content = (
      <div className="h-full overflow-auto" data-tree-scroll>
        <ThreadList project={project} states={states} selectedId={selectedId} sink={sink} woven={woven} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <section ref={box} aria-label="The labyrinth: every step from the brief to the deliverable" className="relative h-full min-h-0 overflow-hidden">
      {content}
      {spiral ? <Legend /> : null}
      {spiral ? (
        <div className="absolute right-[18px] bottom-[18px] z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-raised">
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))} className="h-[30px] w-8 rounded-none border-b border-line text-ink-dim hover:bg-panel">
            ＋
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, value - 0.15))} className="h-[30px] w-8 rounded-none border-b border-line text-ink-dim hover:bg-panel">
            −
          </button>
          <button type="button" aria-label="Fit to screen" onClick={() => setZoom(1)} className="h-[30px] w-8 rounded-none text-[11px] text-ink-dim hover:bg-panel">
            fit
          </button>
        </div>
      ) : null}
    </section>
  );
}
