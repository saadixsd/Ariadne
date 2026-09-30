"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monogram } from "@/components/ThreadBits";
import { useFresh } from "@/components/use-fresh";
import { useClocks, useNow } from "@/components/use-now";
import { taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  carriedInto,
  carriedNoun,
  charsLabel,
  inputChars,
  durationSeconds,
  modelTag,
  objectOf,
  outputGist,
  since,
  stopwatch,
  threadState,
  type ThreadState,
} from "@/lib/thread";
import { ancestorsOf, layoutDag, placeDag, type DagLayout } from "@/lib/dag-layout";
import { briefLead } from "@/lib/text-fold";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

// Space kept clear under the graph for the floating legend chip.
const LEGEND_ROOM = 56;
const RED = "var(--color-thread)";
const GRAPHITE = "var(--color-thread-dim)";
const MIN_GRAPH_WIDTH = 720;

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
      className={`block min-w-[190px] max-w-[250px] rounded-xl border px-3 pt-[9px] pb-2.5 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_0_rgba(31,26,20,.04),0_16px_28px_-12px_rgba(31,26,20,.3)] motion-reduce:hover:translate-y-0 ${tones[state]} ${
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

// The door is a compact card at the same scale as a step; the full brief opens in the rail.
const DOOR_W = 230;
const DOOR_H = 84;

function DoorCard({ project, selected, onSelect }: { project: ProjectDTO; selected: boolean; onSelect: (id: string) => void }) {
  const { clockShort } = useClocks();
  const lead = briefLead(project.brief);
  return (
    <button
      type="button"
      data-node-focus="root"
      data-node-id="root"
      onClick={() => onSelect("root")}
      aria-label="The door: the project brief. Open the full brief."
      aria-pressed={selected}
      title={lead ? "Open the full brief" : undefined}
      style={{ width: DOOR_W }}
      className={`block rounded-xl border border-ink bg-ink px-3 pt-[9px] pb-2.5 text-left text-raised shadow-[0_6px_18px_-8px_rgba(31,26,20,.4)] transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
        selected ? "outline-2 outline-offset-[3px] outline-thread" : ""
      }`}
    >
      <span className="flex justify-between gap-3 font-mono text-[10.5px] tracking-[0.06em] whitespace-nowrap text-[#c9bba5] uppercase">
        <span>The door · brief</span>
        <span>{clockShort(project.createdAt)}</span>
      </span>
      <span className="mt-1 line-clamp-2 font-serif text-[15px] leading-[1.3] break-words text-[#ede5d6] italic">
        {lead ? `“${lead}”` : "No brief yet. Every agent reads it before it works."}
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
      <em className="font-serif text-[15px] text-ink">The thread</em>
      <span className="hidden text-ink-faint xl:inline">from the door to the deliverable, drawn from what feeds what</span>
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

/** Below ~720px the graph gets cramped; unroll it into a vertical thread in dependency order. */
function ThreadList({
  project,
  layout,
  states,
  selectedId,
  sink,
  woven,
  onSelect,
}: {
  project: ProjectDTO;
  layout: DagLayout;
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
      {layout.order.map((id) => {
        const index = project.tasks.findIndex((item) => item.id === id);
        const task = project.tasks[index];
        if (!task) return null;
        const state = states[index];
        const fedBy = (layout.parents.get(id) ?? []).map((parent) => taskNumber(parent, project.tasks));
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
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                {fedBy.length > 0 ? `fed by ${fedBy.map((n) => `step ${n}`).join(" + ")}` : "fed by the door"}
              </p>
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

const COL_W = 300;
const ROW_H = 132;
const PAD_X = 140;
const PAD_Y = 70;
const CARD_HALF = 118;
// Below this the cards stop being readable; the graph pans sideways instead of shrinking further.
const MIN_SCALE = 0.7;

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const bend = Math.max(40, (b.x - a.x) * 0.5);
  return `M${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
}

function edgeKind(from: ThreadState | "door", to: ThreadState | "centre", woven: boolean): Segment["kind"] {
  const fed = from === "door" || from === "spun";
  if (!fed) return "unspun";
  return segmentKind(to, woven);
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
  const stateOf = new Map(tasks.map((task, index) => [task.id, states[index]]));
  const indexOf = new Map(tasks.map((task, index) => [task.id, index]));
  const layout = useMemo(() => layoutDag(tasks), [tasks]);
  const sinks = layout.sinks.map((id) => tasks[indexOf.get(id) ?? 0]).filter(Boolean);
  const sink = [...sinks].sort((a, b) => (indexOf.get(b.id) ?? 0) - (indexOf.get(a.id) ?? 0))[0] ?? tasks.at(-1);
  const woven = sinks.length > 0 && sinks.every((item) => item.status === "done" && !!item.output);
  const fresh = useFresh([
    ...tasks.filter((_, index) => states[index] === "spun" || states[index] === "knot").map((task) => task.id),
    ...(woven ? ["output"] : []),
  ]);

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

  const graph = size.width >= MIN_GRAPH_WIDTH && tasks.length > 0;
  const placed = placeDag(layout, { colW: COL_W, rowH: ROW_H, padX: PAD_X, padY: PAD_Y, door: { width: DOOR_W, height: DOOR_H } });
  const W = Math.max(placed.width, 600);
  const H = Math.max(placed.height, 360) + LEGEND_ROOM;
  const fit = size.width && size.height ? Math.max(MIN_SCALE, Math.min(1, size.width / W, (size.height - 8) / H)) : 1;
  const scale = fit * zoom;

  // When the graph is wider than the pane (rail open, narrow window), bring the selected card into view.
  useEffect(() => {
    if (!selectedId) return;
    const element = box.current?.querySelector<HTMLElement>(`[data-tree-scroll] [data-node-id="${CSS.escape(selectedId)}"]`);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId, scale]);
  // Lineage: while a step is hovered or selected, what fed into it stays lit and the rest recedes.
  const focusId = hover ?? (selectedId && indexOf.has(selectedId) ? selectedId : null);
  const lineage = focusId ? ancestorsOf(focusId, layout) : null;
  const lit = (from: string, to: string) =>
    !lineage || !focusId ? true : (to === focusId || lineage.has(to)) && (from === "root" || lineage.has(from));

  let content = null;
  if (graph && size.width > 0) {
    const yOffset = (H - LEGEND_ROOM - placed.height) / 2;
    const at = (point: { x: number; y: number }) => ({ x: point.x + (W - placed.width) / 2, y: point.y + yOffset });
    const door = at(placed.door);
    const centre = at(placed.centre);
    const pos = new Map([...placed.nodes].map(([id, point]) => [id, at(point)]));
    const out = (point: { x: number; y: number }) => ({ x: point.x + CARD_HALF, y: point.y });
    const into = (point: { x: number; y: number }) => ({ x: point.x - CARD_HALF - 6, y: point.y });
    type Drawn = Segment & { from: string; to: string; mid: { x: number; y: number } };
    const drawn: Drawn[] = [];
    const push = (from: string, to: string, a: { x: number; y: number }, b: { x: number; y: number }, kind: Segment["kind"]) =>
      drawn.push({ id: `${from}->${to}`, from, to, d: edgePath(a, b), kind, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
    for (const id of layout.sources) {
      const point = pos.get(id);
      if (point) push("root", id, { x: door.x + DOOR_W / 2, y: door.y }, into(point), edgeKind("door", stateOf.get(id) ?? "unspun", woven));
    }
    for (const edge of layout.edges) {
      const a = pos.get(edge.from);
      const b = pos.get(edge.to);
      if (a && b) push(edge.from, edge.to, out(a), into(b), edgeKind(stateOf.get(edge.from) ?? "unspun", stateOf.get(edge.to) ?? "unspun", woven));
    }
    for (const id of layout.sinks) {
      const point = pos.get(id);
      if (point) push(id, "output", out(point), { x: centre.x - 60, y: centre.y - 18 }, edgeKind(stateOf.get(id) ?? "unspun", "centre", woven));
    }
    const knots = tasks.filter((_, index) => states[index] === "knot").map((task) => pos.get(task.id)).filter((point) => !!point);
    const hoverIndex = hover ? (indexOf.get(hover) ?? -1) : -1;
    const hoverPlace = hover ? pos.get(hover) : undefined;

    content = (
      <div className="flex h-full overflow-auto" data-tree-scroll>
        <div className="relative m-auto shrink-0" style={{ width: W * scale, height: H * scale }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
              {drawn.map((segment) => (
                <path
                  key={`${segment.id}-${segment.kind}`}
                  d={segment.d}
                  fill="none"
                  strokeLinecap="round"
                  pathLength={segment.kind === "spun" ? 1 : undefined}
                  className={`tree-edge ${segment.kind === "spun" ? (fresh(segment.to) ? "thread-draw" : "") : segment.kind === "spinning" ? "thread-spin" : ""} ${
                    lit(segment.from, segment.to) ? "" : "tree-edge-faded"
                  }`}
                  stroke={segment.kind === "unspun" ? GRAPHITE : segment.kind === "frayed" ? "var(--color-danger)" : RED}
                  strokeWidth={segment.kind === "unspun" ? 2 : 3}
                  strokeDasharray={segment.kind === "unspun" ? "2 6" : segment.kind === "frayed" ? "6 5 2 7" : segment.kind === "spinning" ? "6 4" : undefined}
                />
              ))}
              {knots.map((point) => (
                <circle key={`${point.x}-${point.y}`} cx={point.x - CARD_HALF - 6} cy={point.y} r={8} fill="var(--color-gate)" stroke="var(--color-raised)" strokeWidth={2} />
              ))}
            </svg>
            {drawn
              .filter((segment) => segment.from !== "root" && segment.to !== "output" && segment.kind !== "unspun")
              .map((segment) => {
                const source = tasks[indexOf.get(segment.from) ?? -1];
                if (!source) return null;
                return (
                  <span
                    key={`bead-${segment.id}`}
                    className={`tree-edge absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-thread-soft bg-raised px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-thread ${
                      lit(segment.from, segment.to) ? "" : "tree-edge-faded"
                    }`}
                    style={{ left: segment.mid.x, top: segment.mid.y }}
                  >
                    {carriedNoun(source, project.agents)} →
                  </span>
                );
              })}
            <div className="absolute z-[3] -translate-x-1/2 -translate-y-1/2" style={{ left: door.x, top: door.y }}>
              <DoorCard project={project} selected={selectedId === "root"} onSelect={onSelect} />
            </div>
            {tasks.map((task, index) => {
              const point = pos.get(task.id);
              if (!point) return null;
              return (
                <div key={task.id} className="absolute z-[3] -translate-x-1/2 -translate-y-1/2" style={{ left: point.x, top: point.y }}>
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
              );
            })}
            <div className="absolute z-[2] -translate-x-1/2 -translate-y-1/2" style={{ left: centre.x, top: centre.y }}>
              <CentreCard project={project} sink={sink} woven={woven} selected={selectedId === "output"} onSelect={onSelect} />
            </div>
            {hover && hoverPlace && hoverIndex >= 0 ? (
              <div
                className="pointer-events-none absolute z-[6]"
                style={{
                  left: Math.min(W - 160, Math.max(160, hoverPlace.x)),
                  top: hoverPlace.y > H - 220 ? hoverPlace.y - 56 : hoverPlace.y + 54,
                  transform: `translate(-50%, ${hoverPlace.y > H - 220 ? "-100%" : "0"})`,
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
        <ThreadList project={project} layout={layout} states={states} selectedId={selectedId} sink={sink} woven={woven} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <section ref={box} aria-label="The thread: every step from the brief to the deliverable, drawn from what feeds what" className="relative h-full min-h-0 overflow-hidden">
      {content}
      {graph ? <Legend /> : null}
      {graph ? (
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
