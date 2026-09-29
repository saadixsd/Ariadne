"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoordinationTree } from "@/components/CoordinationTree";
import { TreeDetailRail } from "@/components/TreeDetailRail";
import { ViewSwitch } from "@/components/ViewSwitch";
import { acceptPolledProject } from "@/lib/board-project";
import { DAILY_MODEL_RUNS } from "@/lib/limits";
import { workflowTree } from "@/lib/live-tree";
import { hideModelIds } from "@/lib/model-label";
import { cascadeFrom, taskNumber } from "@/lib/task-rules";
import type { ProjectDTO } from "@/lib/types";

export function LiveTree({
  initial,
  projects,
  runsLeft,
  authorName,
}: {
  initial: ProjectDTO;
  projects: { id: string; name: string }[];
  runsLeft: number;
  authorName: string;
}) {
  const [data, setData] = useState(initial);
  const [remaining, setRemaining] = useState(runsLeft);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [toast, setToast] = useState<{ tone: "danger" | "ok"; text: string } | null>(null);
  const selectedIdRef = useRef(initial.id);
  const busy = useRef(false);
  const tree = useMemo(() => workflowTree(data), [data]);
  const detailNode = tree.nodes.find((node) => node.id === detailId) ?? null;

  const load = useCallback(async (force = false) => {
    if (!force && busy.current) return null;
    const projectId = selectedIdRef.current;
    const response = await fetch(`/api/projects/${projectId}`);
    if (!acceptPolledProject(selectedIdRef.current, projectId) || !response.ok) return null;
    const project = (await response.json()) as ProjectDTO;
    if (!acceptPolledProject(selectedIdRef.current, project.id)) return null;
    setData(project);
    return project;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    busy.current = true;
    setPendingId(taskId);
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => (item.id === taskId ? { ...item, status: "running", output: null } : item)),
    }));
    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      const body = (await response.json()) as { error?: string; task?: { status: string } };
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${hideModelIds(body.error ?? "Run failed")}. Open the task to copy the error, or press Retry when you want another attempt.`,
        });
      } else if (data.agents.find((agent) => agent.id === task?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      const next = await load(true);
      const updated = next?.tasks.find((item) => item.id === taskId);
      if (updated?.status === "awaiting_approval") setDetailId(taskId);
    } catch {
      setToast({
        tone: "danger",
        text: "Could not reach the server. The run was not confirmed. Check the dev server before pressing Run again.",
      });
      await load(true);
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }

  function closeDetail() {
    const id = detailId;
    setDetailId(null);
    if (!id) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-node-focus="${CSS.escape(id)}"]`)?.focus();
    });
  }

  async function decide(approved: boolean, note: string) {
    const id = detailNode?.taskId;
    if (!id) return;
    const saved = (project: ProjectDTO | null) => {
      const current = project?.tasks.find((task) => task.id === id);
      return approved ? current?.status === "done" : current?.status === "pending";
    };
    busy.current = true;
    try {
      const response = await fetch(`/api/tasks/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, note }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const next = await load(true);
      if (response.ok || saved(next)) return;
      setToast({
        tone: "danger",
        text: `${body?.error ?? "Could not save the decision"}. The gate is unchanged. Try again.`,
      });
    } catch {
      const next = await load(true).catch(() => null);
      if (saved(next)) return;
      setToast({
        tone: "danger",
        text: "Could not save the decision. The gate is unchanged. Try again.",
      });
    } finally {
      busy.current = false;
    }
  }

  async function confirmRerun() {
    if (!rerunId) return;
    busy.current = true;
    setRerunning(true);
    setPendingId(rerunId);
    try {
      const response = await fetch(`/api/tasks/${rerunId}/rerun`, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${hideModelIds(body.error ?? "Could not re-run")}. Refresh the board before trying again.`,
        });
        await load(true);
        return;
      }
      const rerunTask = data.tasks.find((item) => item.id === rerunId);
      if (data.agents.find((agent) => agent.id === rerunTask?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      setRerunId(null);
      const next = await load(true);
      const updated = next?.tasks.find((item) => item.status === "awaiting_approval");
      if (updated) setDetailId(updated.id);
    } catch {
      setToast({ tone: "danger", text: "Could not reach the server. The re-run was not confirmed." });
    } finally {
      busy.current = false;
      setRerunning(false);
      setPendingId(null);
    }
  }

  return (
    <main className="min-h-full bg-[#f6faf6] text-[#101812]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfe9e1] bg-white px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="shrink-0 pb-0.5">
            <p className="text-xs font-semibold tracking-[0.28em] text-[#0e5c36]">ARIADNE</p>
            <span className="mt-1 block h-px w-full bg-[#0e5c36]" aria-hidden />
          </div>
          <label className="min-w-0">
            <span className="sr-only">Project</span>
            <select
              value={data.id}
              onChange={(event) => {
                window.location.href = `/tree?project=${encodeURIComponent(event.target.value)}`;
              }}
              className="max-w-56 truncate rounded-md bg-white px-2 py-1 text-sm font-semibold text-[#101812] ring-1 ring-[#dfe9e1]"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <ViewSwitch view="tree" projectId={data.id} />
        </div>
        <p className="flex items-center gap-1.5 rounded-full bg-[#e7f4ec] px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#0e5c36] ring-1 ring-[#cfe3d6]">
          <span className="pulse-status h-1.5 w-1.5 rounded-full bg-[#10b981]" aria-hidden />
          TREE VIEW · LIVE
        </p>
      </header>
      <p className="border-b border-[#dfe9e1] px-4 py-2 text-sm leading-normal text-[#5c6f61]">
        {remaining} of {DAILY_MODEL_RUNS} free agent runs left today.
      </p>
      {detailNode ? (
        <button type="button" aria-label="Close details" className="fixed inset-0 z-30 bg-[#101812]/15" onClick={closeDetail} />
      ) : null}
      <CoordinationTree
        tree={tree}
        pendingId={pendingId}
        selectedId={detailId}
        onSelect={setDetailId}
        onBackdrop={detailNode ? closeDetail : undefined}
        onRun={(id) => void run(id)}
        onReview={setDetailId}
        onRerun={setRerunId}
      />
      <footer className="border-t border-[#dfe9e1] bg-white px-6 py-4">
        <h2 className="text-xs font-semibold tracking-[0.16em] text-[#0e5c36]">LEGEND</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#5c6f61]">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0e5c36]" aria-hidden />
            Branch — a step an agent is doing or has finished
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" aria-hidden />
            Gate — gold, waiting on you
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#a9b8ad]" aria-hidden />
            Pruned — faded, dashed, kept so the dead end stays visible
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" aria-hidden />
            Output — the artifact where branches converge
          </li>
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-[#0e5c36]" aria-hidden />
            Green line — work that has moved. Gray line — a link. Dashed — a pruned path
          </li>
        </ul>
      </footer>
      {detailNode ? (
        <TreeDetailRail
          key={detailNode.id}
          project={data}
          node={detailNode}
          authorName={authorName}
          pendingId={pendingId}
          onClose={closeDetail}
          onRun={(id) => void run(id)}
          onRerun={setRerunId}
          onDecide={decide}
        />
      ) : null}
      {rerunId ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#101812]/30 p-4 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rerun-title"
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-[0_12px_40px_rgba(16,24,18,0.16)] ring-1 ring-[#dfe9e1]"
          >
            <h2 id="rerun-title" className="text-lg font-semibold leading-tight text-[#101812]">
              Re-run this task
            </h2>
            <p className="mt-2 text-sm leading-normal text-[#5c6f61]">
              These steps return to pending and lose their output. Only the task you re-run calls an agent. The rest stay pending until you press Run.
            </p>
            <ul className="mt-3 space-y-1 text-sm leading-normal">
              {cascadeFrom(rerunId, data.tasks).map((task) => (
                <li key={task.id}>
                  #{taskNumber(task.id, data.tasks)} {task.title}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRerunId(null)} className="px-3 py-2 text-sm text-[#5c6f61] hover:text-[#101812]">
                Cancel
              </button>
              <button
                type="button"
                disabled={rerunning}
                onClick={() => void confirmRerun()}
                className="rounded-md bg-[#0e5c36] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b4a2b] disabled:opacity-50"
              >
                {rerunning ? "Re-running" : "Re-run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className={`fixed right-4 bottom-14 z-50 max-w-sm rounded-lg bg-white px-4 py-3 text-sm leading-normal shadow-[0_8px_24px_rgba(16,24,18,0.12)] ring-1 ${
            toast.tone === "ok" ? "text-[#0e5c36] ring-[#10b981]/40" : "text-[#b91c1c] ring-[#fca5a5]"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
