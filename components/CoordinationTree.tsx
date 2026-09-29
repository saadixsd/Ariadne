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
const LIFT = "hover:shadow-[0_2px_4px_rgba(16,24,18,0.06),0_10px_24px_rgba(16,24,18,0.1)]";

function statusDot(status: TreeStatus | undefined, taskStatus: string | undefined) {
  if (taskStatus === "failed") return "bg-[#dc2626]";
  if (status === "done") return "bg-[#0e5c36]";
  if (status === "active") return "bg-[#10b981] pulse-status";
  if (status === "waiting") return "bg-[#f59e0b] pulse-status";
  if (status === "pruned") return "bg-[#b8c6bb]";
  return "bg-[#c3cdc5]";
}

function cardClass(node: TreeNode) {
  if (node.kind === "pruned" || node.status === "pruned") {
    return "border border-dashed border-[#b8c6bb] bg-[#eef2ee] opacity-60";
  }
  if (node.kind === "gate" && node.status === "waiting") return "tree-gate border border-[#f59e0b] bg-white";
  if (node.kind === "gate") return `border border-[#f59e0b]/45 bg-white ${SHADOW} ${LIFT}`;
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

function RootCard({ node }: { node: TreeNode }) {
  return (
    <article
      data-node-id={node.id}
      className={`tree-card w-44 shrink-0 overflow-hidden rounded-[11px] border border-[#0e5c36] bg-white ${SHADOW} ${LIFT}`}
    >
      <div className="bg-[#0e5c36] px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#10b981]" aria-hidden />
          <h3 className="text-sm font-semibold leading-tight text-white">{node.label}</h3>
        </div>
      </div>
      {node.note ? <p className="px-3 py-2 text-xs leading-normal text-[#5c6f61]">{node.note}</p> : null}
    </article>
  );
}

function NodeCard({
  node,
  pendingId,
  onRun,
  onReview,
  onRerun,
}: {
  node: TreeNode;
  pendingId: string | null;
  onRun: (taskId: string) => void;
  onReview: (taskId: string) => void;
  onRerun: (taskId: string) => void;
}) {
  const chip = [node.role, node.model].filter(Boolean).join(" · ");
  const ticking = node.status === "active" || node.status === "waiting";
  const busy = node.taskId !== undefined && pendingId === node.taskId;
  if (node.kind === "root") return <RootCard node={node} />;
  return (
    <article data-node-id={node.id} className={`tree-card w-44 shrink-0 rounded-[11px] px-3 py-3 ${cardClass(node)}`}>
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
      {node.note ? (
        <p className={`mt-2 text-xs leading-normal ${node.status === "locked" ? "text-[#9aa89e]" : "text-[#5c6f61]"}`}>
          {node.note}
        </p>
      ) : null}
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
    </article>
  );
}

function edgeStroke(kind: EdgeKind, intoWaitingGate: boolean) {
  if (kind === "dead") return "#a9b8ad";
  if (kind === "thread") return intoWaitingGate ? "url(#tree-gate)" : "url(#tree-thread)";
  return "#c9d6cc";
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
  onRun,
  onReview,
  onRerun,
}: {
  tree: TreeWorkflow;
  pendingId: string | null;
  onRun: (taskId: string) => void;
  onReview: (taskId: string) => void;
  onRerun: (taskId: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ id: string; to: string; d: string; kind: EdgeKind }[]>([]);
  const columns = columnsByDepth(tree);
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));

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
    }

    draw();
    const frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    window.addEventListener("resize", draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [tree]);

  return (
    <div data-tree-scroll className="overflow-x-auto">
      <div ref={canvas} className="relative flex w-max min-w-full items-center gap-14 px-6 py-12">
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="tree-thread" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0e5c36" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="tree-gate" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="70%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill="none"
              stroke={edgeStroke(
                path.kind,
                byId.get(path.to)?.kind === "gate" && byId.get(path.to)?.status === "waiting",
              )}
              strokeWidth={path.kind === "thread" ? 2.5 : 1.5}
              strokeDasharray={path.kind === "dead" ? "5 5" : undefined}
            />
          ))}
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
  );
}
