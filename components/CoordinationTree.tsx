"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EdgeKind, TreeNode, TreeStatus, TreeWorkflow } from "@/lib/live-tree";
import { columnsByDepth } from "@/lib/tree-layout";

function formatElapsed(total: number) {
  const safe = Math.max(0, total);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Elapsed({
  since,
  frozen,
  ticking,
}: {
  since?: string | null;
  frozen?: number;
  ticking: boolean;
}) {
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    if (!ticking || !since) return;
    const tick = () => {
      const start = Date.parse(since);
      if (Number.isNaN(start)) return;
      setLive(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [since, ticking]);

  const seconds = ticking ? live : frozen;
  if (seconds === undefined || seconds === null) return null;
  return <span className="font-mono text-[11px] font-medium tabular-nums text-[#10b981]">{formatElapsed(seconds)}</span>;
}

const SHADOW = "shadow-[0_1px_2px_rgba(16,24,18,0.04),0_4px_14px_rgba(16,24,18,0.06)]";
const LIFT = "hover:shadow-[0_4px_8px_rgba(16,24,18,0.08),0_16px_32px_rgba(16,24,18,0.14)]";

function statusDot(status: TreeStatus | undefined, taskStatus: string | undefined) {
  const fade = "tree-dot";
  if (taskStatus === "failed") return `${fade} bg-[#dc2626]`;
  if (status === "done") return `${fade} bg-[#0e5c36]`;
  if (status === "active") return `${fade} bg-[#10b981] pulse-status`;
  if (status === "waiting") return `${fade} bg-[#f59e0b]`;
  if (status === "pruned") return `${fade} bg-[#b8c6bb]`;
  return `${fade} bg-[#c3cdc5]`;
}

function cardClass(node: TreeNode) {
  if (node.kind === "pruned" || node.status === "pruned") {
    return "border border-dashed border-[#b8c6bb] bg-[#eef2ee] opacity-60";
  }
  if (node.kind === "gate" && node.status === "waiting") return "tree-gate border border-[#f59e0b] bg-white";
  if (node.kind === "output" && node.status === "done") {
    return `border border-[#10b981] bg-[#ecfdf5] ring-2 ring-[#10b981]/35 ${SHADOW} ${LIFT}`;
  }
  if (node.kind === "output") return "border border-dashed border-[#dfe9e1] bg-white";
  if (node.status === "locked") return "border border-[#e6ebe7] bg-[#f7f8f7]";
  if (node.status === "active") return `border border-[#10b981] bg-white ${SHADOW} ${LIFT}`;
  if (node.taskStatus === "failed") return `border border-[#fca5a5] bg-white ${SHADOW} ${LIFT}`;
  return `border border-[#dfe9e1] bg-white ${SHADOW} ${LIFT}`;
}

function titleClass(node: TreeNode) {
  if (node.status === "locked" || (node.kind === "output" && node.status !== "done")) return "text-[#8a988e]";
  return "text-[#101812]";
}

function RootCard({
  node,
  selected,
  onSelect,
  onShow,
  onHide,
}: {
  node: TreeNode;
  selected: boolean;
  onSelect: (id: string) => void;
  onShow: (id: string, element: HTMLElement) => void;
  onHide: (id: string) => void;
}) {
  return (
    <article
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      onMouseEnter={(event) => onShow(node.id, event.currentTarget)}
      onMouseLeave={() => onHide(node.id)}
      className={`tree-card w-44 shrink-0 cursor-pointer overflow-hidden rounded-[11px] border border-[#0e5c36] bg-white ${SHADOW} ${LIFT} ${selected ? "ring-2 ring-[#0e5c36]" : ""}`}
    >
      <button
        type="button"
        data-node-focus={node.id}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onFocus={(event) => onShow(node.id, event.currentTarget.closest("article") ?? event.currentTarget)}
        onBlur={() => onHide(node.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSelect(node.id);
          }
        }}
        className="tree-node-btn w-full bg-[#0e5c36] px-3 py-3 text-left"
      >
        <span className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#10b981]" aria-hidden />
          <h3 className="text-sm font-semibold leading-tight text-white">{node.label}</h3>
        </span>
      </button>
      {node.note ? <p className="px-3 py-2 text-xs leading-normal text-[#5c6f61]">{node.note}</p> : null}
    </article>
  );
}

function NodeCard({
  node,
  pendingId,
  selected,
  hint,
  onSelect,
  onShow,
  onHide,
  onRun,
  onReview,
  onRerun,
}: {
  node: TreeNode;
  pendingId: string | null;
  selected: boolean;
  hint?: string;
  onSelect: (id: string) => void;
  onShow: (id: string, element: HTMLElement) => void;
  onHide: (id: string) => void;
  onRun: (taskId: string) => void;
  onReview: (taskId: string) => void;
  onRerun: (taskId: string) => void;
}) {
  const chip = [node.role, node.model].filter(Boolean).join(" · ");
  const ticking = node.status === "active" || node.status === "waiting";
  const busy = node.taskId !== undefined && pendingId === node.taskId;
  const note = hint ?? node.note;
  if (node.kind === "root") {
    return <RootCard node={node} selected={selected} onSelect={onSelect} onShow={onShow} onHide={onHide} />;
  }
  return (
    <article
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      onMouseEnter={(event) => onShow(node.id, event.currentTarget)}
      onMouseLeave={() => onHide(node.id)}
      className={`tree-card w-44 shrink-0 cursor-pointer rounded-[11px] px-3 py-3 ${cardClass(node)} ${selected ? "ring-2 ring-[#0e5c36]" : ""}`}
    >
      <button
        type="button"
        data-node-focus={node.id}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onFocus={(event) => onShow(node.id, event.currentTarget.closest("article") ?? event.currentTarget)}
        onBlur={() => onHide(node.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSelect(node.id);
          }
        }}
        className="tree-node-btn w-full text-left"
      >
      {node.kind === "gate" && node.status === "waiting" ? (
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#b45309]">WAITING ON YOU</p>
      ) : null}
      {node.kind === "output" ? (
        <p
          className={`text-[10px] font-semibold tracking-[0.16em] ${node.status === "done" ? "text-[#0e5c36]" : "text-[#8a988e]"}`}
        >
          ARTIFACT
        </p>
      ) : null}
      <div className="mt-1 flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot(node.status, node.taskStatus)}`} aria-hidden />
        <h3 className={`text-sm font-semibold leading-tight ${titleClass(node)}`}>{node.label}</h3>
      </div>
      {chip ? (
        <p
          className={`mt-2 inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${
            node.status === "locked" || node.status === "pruned"
              ? "bg-white/60 text-[#8a988e] ring-[#e6ebe7]"
              : "bg-[#eef6f0] text-[#0e5c36] ring-[#dfe9e1]"
          }`}
        >
          {chip}
        </p>
      ) : null}
      {ticking || node.elapsedSec !== undefined ? (
        <p className="mt-2">
          <Elapsed since={node.since} frozen={node.elapsedSec} ticking={ticking} />
        </p>
      ) : null}
      {note ? (
        <p className={`mt-2 text-xs leading-normal ${node.status === "locked" ? "text-[#9aa89e]" : "text-[#5c6f61]"}`}>
          {note}
        </p>
      ) : null}
      </button>
      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {node.taskId && node.taskStatus === "awaiting_approval" ? (
        <button
          type="button"
          onClick={() => onReview(node.taskId!)}
          className="mt-3 rounded bg-[#f59e0b] px-2 py-1 text-xs font-semibold text-[#101812] hover:bg-[#fbbf24]"
        >
          Review
        </button>
      ) : null}
      {node.taskId && node.taskStatus === "done" ? (
        <button
          type="button"
          onClick={() => onRerun(node.taskId!)}
          className="mt-3 rounded px-2 py-1 text-xs font-medium text-[#0e5c36] ring-1 ring-[#0e5c36]/35 hover:bg-[#eef6f0]"
        >
          Re-run
        </button>
      ) : null}
      {node.taskId &&
      node.status !== "pruned" &&
      node.taskStatus !== "done" &&
      node.taskStatus !== "awaiting_approval" &&
      node.taskStatus !== "running" ? (
        <button
          type="button"
          data-can-run={node.runnable ? "true" : "false"}
          disabled={!node.runnable || busy}
          onClick={() => onRun(node.taskId!)}
          className="mt-3 rounded bg-[#0e5c36] px-2 py-1 text-xs font-medium text-white hover:bg-[#0b4a2b] disabled:cursor-not-allowed disabled:bg-[#e6ebe7] disabled:text-[#9aa89e]"
        >
          {busy ? "Running" : node.taskStatus === "failed" ? "Retry" : "Run"}
        </button>
      ) : null}
      </div>
    </article>
  );
}

function edgeStroke(kind: EdgeKind) {
  if (kind === "dead") return "#a9b8ad";
  if (kind === "thread") return "#0e5c36";
  return "#c9d6cc";
}

function previewStatus(node: TreeNode) {
  if (node.taskStatus === "failed") return "Failed";
  if (node.status === "active") return "Running";
  if (node.status === "waiting") return "Waiting on you";
  if (node.status === "done") return "Done";
  if (node.status === "pruned" || node.kind === "pruned") return "Pruned";
  if (node.status === "locked") return "Locked";
  if (node.runnable) return "Ready";
  if (node.kind === "root") return "Brief";
  if (node.kind === "output") return "No output yet";
  return "Pending";
}

function handoffNames(node: TreeNode, tree: TreeWorkflow, byId: Map<string, TreeNode>) {
  return tree.edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => byId.get(edge.to))
    .filter((next): next is TreeNode => next != null && next.kind !== "output" && next.kind !== "root")
    .map((next) => next.role || next.label);
}

function previewLine(node: TreeNode, tree: TreeWorkflow, byId: Map<string, TreeNode>) {
  if (node.kind === "root") return "The brief the rest of the work starts from.";
  if (node.kind === "output") {
    return node.status === "done"
      ? `The finished artifact from ${node.label}.`
      : "No output yet. It lands here when the work is finished.";
  }
  if (node.kind === "pruned" || node.status === "pruned") {
    return `${node.role ?? "This step"} was pruned. What it produced stays visible.`;
  }
  const next = handoffNames(node, tree, byId);
  const hands = next.length > 0 ? ` and hands it to ${next.join(" and ")}` : "";
  if (node.kind === "gate") {
    if (node.status === "waiting") return `Waiting on you to decide “${node.label}”.`;
    return `You decide “${node.label}”${hands}.`;
  }
  const who = node.role ?? "This step";
  return `${who} takes “${node.label}”${hands}.`;
}

function unlockHint(node: TreeNode, tree: TreeWorkflow, byId: Map<string, TreeNode>) {
  const blockers = tree.edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => byId.get(edge.from))
    .filter((parent): parent is TreeNode => parent != null && parent.kind !== "root" && parent.status !== "done");
  if (blockers.length === 1) return `Unlocks when ${blockers[0]?.label} finishes.`;
  if (blockers.length > 1) {
    const names = blockers.map((parent) => parent.label);
    return `Unlocks when ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} finish.`;
  }
  return "Unlocks when the steps it needs are finished.";
}

type Preview = { id: string; left: number; top: number; above: boolean };

function placePreview(rect: DOMRect): Omit<Preview, "id"> {
  const width = 240;
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
  const above = rect.top > 150;
  return { left, top: above ? rect.top - 8 : rect.bottom + 8, above };
}

type Box = { left: number; right: number; top: number; bottom: number };

function directCurve(x1: number, y1: number, x2: number, y2: number) {
  const bend = Math.max(16, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function aroundCards(x1: number, y1: number, x2: number, y2: number, lane: number) {
  const spanIn = Math.abs(lane - y1);
  const spanOut = Math.abs(lane - y2);
  const radius = Math.max(0, Math.min(10, spanIn / 2, spanOut / 2, (x2 - x1) / 4));
  const dirIn = lane >= y1 ? 1 : -1;
  const dirOut = y2 >= lane ? 1 : -1;
  const xa = x1 + Math.max(18, radius + 6);
  const xb = x2 - Math.max(18, radius + 6);
  if (radius === 0) return `M ${x1} ${y1} H ${xa} V ${lane} H ${xb} V ${y2} H ${x2}`;
  return [
    `M ${x1} ${y1}`,
    `H ${xa - radius}`,
    `Q ${xa} ${y1} ${xa} ${y1 + dirIn * radius}`,
    `V ${lane - dirIn * radius}`,
    `Q ${xa} ${lane} ${xa + radius} ${lane}`,
    `H ${xb - radius}`,
    `Q ${xb} ${lane} ${xb} ${lane + dirOut * radius}`,
    `V ${y2 - dirOut * radius}`,
    `Q ${xb} ${y2} ${xb + radius} ${y2}`,
    `H ${x2}`,
  ].join(" ");
}

export function CoordinationTree({
  tree,
  pendingId,
  selectedId,
  onSelect,
  onBackdrop,
  onRun,
  onReview,
  onRerun,
}: {
  tree: TreeWorkflow;
  pendingId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBackdrop?: () => void;
  onRun: (taskId: string) => void;
  onReview: (taskId: string) => void;
  onRerun: (taskId: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const framed = useRef(false);
  const [paths, setPaths] = useState<{ id: string; to: string; d: string; kind: EdgeKind }[]>([]);
  const [metrics, setMetrics] = useState({ scroll: 0, client: 0, width: 0 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const columns = columnsByDepth(tree);
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const firstLockedId = tree.nodes.find(
    (node) => node.status === "locked" && node.kind !== "output" && node.kind !== "root",
  )?.id;
  const previewNode = preview ? byId.get(preview.id) : undefined;

  function trackPreview(current: Preview | null): Preview | null {
    if (!current) return current;
    const element = nodes.current.get(current.id);
    const scroller = scrollRef.current;
    if (!element || !scroller) return null;
    const rect = element.getBoundingClientRect();
    const port = scroller.getBoundingClientRect();
    if (rect.right < port.left + 8 || rect.left > port.right - 8) return null;
    return { id: current.id, ...placePreview(rect) };
  }

  function readMetrics() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const next = {
      scroll: scroller.scrollLeft,
      client: scroller.clientWidth,
      width: scroller.scrollWidth,
    };
    setMetrics((current) =>
      current.scroll === next.scroll && current.client === next.client && current.width === next.width ? current : next,
    );
    setPreview(trackPreview);
  }

  function showPreview(id: string, element: HTMLElement) {
    const placed = placePreview(element.getBoundingClientRect());
    setPreview({ id, ...placed });
  }

  function hidePreview(id: string) {
    setPreview((current) => {
      if (!current || current.id !== id) return current;
      const focused = document.activeElement?.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (focused === id) return current;
      return null;
    });
  }

  function frameTree() {
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const actionable =
      tree.nodes.find((node) => node.status === "waiting") ??
      tree.nodes.find((node) => node.status === "active") ??
      tree.nodes.find((node) => node.runnable) ??
      null;
    const rootEl = nodes.current.get("root");
    const targetEl = actionable ? nodes.current.get(actionable.id) : rootEl;
    if (!rootEl || !targetEl) return;
    const port = scroller.getBoundingClientRect();
    const start = rootEl.getBoundingClientRect();
    const end = targetEl.getBoundingClientRect();
    const left = start.left - port.left + scroller.scrollLeft;
    const right = end.right - port.left + scroller.scrollLeft;
    const pad = 24;
    scroller.scrollLeft =
      right - left + pad * 2 <= scroller.clientWidth
        ? Math.max(0, left - pad)
        : Math.max(0, right - scroller.clientWidth + pad);
  }

  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;

    function draw() {
      const box = root?.getBoundingClientRect();
      if (!box) return;
      const rects = new Map<string, Box>();
      for (const [id, element] of nodes.current) {
        const rect = element.getBoundingClientRect();
        rects.set(id, {
          left: rect.left - box.left,
          right: rect.right - box.left,
          top: rect.top - box.top,
          bottom: rect.bottom - box.top,
        });
      }
      const lanes = { above: 0, below: 0 };
      const next = tree.edges.flatMap((edge) => {
        const from = rects.get(edge.from);
        const to = rects.get(edge.to);
        if (!from || !to) return [];
        const x1 = from.right;
        const y1 = (from.top + from.bottom) / 2;
        const x2 = to.left;
        const y2 = (to.top + to.bottom) / 2;
        const between = [...rects.values()].filter(
          (rect) => rect !== from && rect !== to && rect.right > x1 + 2 && rect.left < x2 - 2,
        );
        const bandTop = Math.min(y1, y2) - 8;
        const bandBot = Math.max(y1, y2) + 8;
        const blocked = between.some((rect) => rect.bottom > bandTop && rect.top < bandBot);
        let d = directCurve(x1, y1, x2, y2);
        if (blocked && between.length > 0) {
          const below = Math.max(...between.map((rect) => rect.bottom)) + 26 + lanes.below * 14;
          const above = Math.min(...between.map((rect) => rect.top)) - 26 - lanes.above * 14;
          const useBelow =
            Math.abs(below - y1) + Math.abs(below - y2) <= Math.abs(above - y1) + Math.abs(above - y2);
          if (useBelow) lanes.below += 1;
          else lanes.above += 1;
          d = aroundCards(x1, y1, x2, y2, useBelow ? below : above);
        }
        return [{ id: `${edge.from}-${edge.to}`, to: edge.to, kind: edge.kind, d }];
      });
      setPaths(next);
      readMetrics();
      setPreview(trackPreview);
    }

    draw();
    if (!framed.current) {
      framed.current = true;
      frameTree();
      readMetrics();
    }
    const frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    const scroller = scrollRef.current;
    if (scroller) observer.observe(scroller);
    window.addEventListener("resize", draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [tree]);

  const overflow = metrics.width > metrics.client + 1;
  const moreRight = overflow && metrics.scroll + metrics.client < metrics.width - 8;
  const thumb = overflow ? Math.max(12, (metrics.client / metrics.width) * 100) : 100;
  const thumbLeft = overflow ? (metrics.scroll / (metrics.width - metrics.client)) * (100 - thumb) : 0;

  function scrubTo(clientX: number, track: HTMLElement) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = ratio * max;
    readMetrics();
  }

  return (
    <div className={onBackdrop ? "relative z-40" : "relative"}>
    <div className="relative">
    <div
      ref={scrollRef}
      data-tree-scroll
      className="overflow-x-auto"
      onScroll={readMetrics}
      onClick={(event) => {
        if (!onBackdrop) return;
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        onBackdrop();
      }}
    >
      <div ref={canvas} className="relative flex w-max min-w-full items-center gap-14 py-12 pl-6 pr-24">
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {paths.map((path) => {
            const feedingActive = byId.get(path.to)?.status === "active";
            return (
            <path
              key={path.id}
              d={path.d}
              fill="none"
              className={`tree-edge${feedingActive ? " tree-flow" : ""}`}
              stroke={feedingActive ? "#10b981" : edgeStroke(path.kind)}
              strokeWidth={2}
              strokeDasharray={path.kind === "dead" ? "5 5" : undefined}
            />
            );
          })}
        </svg>
        {columns.map((column, index) => (
          <div key={index} className="relative z-10 flex shrink-0 flex-col justify-center gap-4">
            {column.map((id) => {
              const node = byId.get(id);
              if (!node) return null;
              return (
                <div
                  key={id}
                  ref={(element) => {
                    if (element) nodes.current.set(id, element);
                    else nodes.current.delete(id);
                  }}
                >
                  <NodeCard
                    node={node}
                    pendingId={pendingId}
                    selected={selectedId === node.id}
                    hint={node.id === firstLockedId ? unlockHint(node, tree, byId) : undefined}
                    onSelect={onSelect}
                    onShow={showPreview}
                    onHide={hidePreview}
                    onRun={onRun}
                    onReview={onReview}
                    onRerun={onRerun}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
    {moreRight ? (
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f6faf6] to-transparent" />
    ) : null}
    </div>
    {overflow ? (
      <div className="px-4 pt-1 pb-3">
        <div
          role="scrollbar"
          aria-label="Tree position"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={overflow ? Math.round((metrics.scroll / Math.max(1, metrics.width - metrics.client)) * 100) : 0}
          tabIndex={0}
          className="relative h-7 cursor-pointer"
          onPointerDown={(event) => {
            scrubTo(event.clientX, event.currentTarget);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            scrubTo(event.clientX, event.currentTarget);
          }}
          onKeyDown={(event) => {
            const scroller = scrollRef.current;
            if (!scroller) return;
            if (event.key === "ArrowRight") scroller.scrollLeft += 80;
            if (event.key === "ArrowLeft") scroller.scrollLeft -= 80;
            readMetrics();
          }}
        >
          <span className="absolute top-3 right-0 left-0 h-1.5 rounded-full bg-[#e6ebe7]" />
          <span
            className="absolute top-3 h-1.5 rounded-full bg-[#0e5c36]"
            style={{ width: `${thumb}%`, left: `${thumbLeft}%` }}
          />
        </div>
      </div>
    ) : null}
    {preview && previewNode ? (
      <div
        data-node-preview={preview.id}
        className="pointer-events-none fixed z-30 w-60 rounded-[11px] border border-[#dfe9e1] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(16,24,18,0.12)]"
        style={{ left: preview.left, top: preview.top, transform: preview.above ? "translateY(-100%)" : undefined }}
      >
        <p className="text-sm leading-normal text-[#101812]">{previewLine(previewNode, tree, byId)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#5c6f61]">
          {previewNode.model ? (
            <span className="rounded bg-[#eef6f0] px-1.5 py-0.5 font-mono text-[#0e5c36] ring-1 ring-[#dfe9e1]">
              {previewNode.model}
            </span>
          ) : null}
          <span>{previewStatus(previewNode)}</span>
        </p>
        <p className="mt-1 text-[11px] font-medium text-[#0e5c36]">Click to inspect</p>
      </div>
    ) : null}
    </div>
  );
}
