"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NewTaskInput } from "@/components/AddTaskForm";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AgentColumn } from "@/components/AgentColumn";
import { ApprovalModal } from "@/components/ApprovalModal";
import { BetaMissions } from "@/components/BetaMissions";
import { ContextDrawer } from "@/components/ContextDrawer";
import { FeedbackModal } from "@/components/FeedbackModal";
import { RegionBoundary } from "@/components/RegionBoundary";
import { SetupBanner } from "@/components/SetupBanner";
import { TaskColumn } from "@/components/TaskColumn";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { useFlag, writeFlag } from "@/components/client-storage";
import { DAILY_MODEL_RUNS } from "@/lib/limits";
import { cascadeFrom, taskNumber } from "@/lib/task-rules";
import type { ActivityEventDTO, ProjectDTO, TaskDTO } from "@/lib/types";

export type ProjectOption = { id: string; name: string };

const HINT_KEY = "ariadne.hint.blocked";
const MET_KEY = "ariadne.welcome.met";

function observeStatuses(next: ProjectDTO, previousStatus: Record<string, string>) {
  let expandedId: string | null = null;
  let approvalId: string | null = null;
  for (const task of next.tasks) {
    const previous = previousStatus[task.id];
    if (!previous || previous === task.status) continue;
    if (
      task.status === "running" ||
      task.status === "done" ||
      task.status === "failed" ||
      task.status === "awaiting_approval"
    ) {
      expandedId = task.id;
    }
    if (task.status === "awaiting_approval") approvalId = task.id;
  }
  return {
    expandedId,
    approvalId,
    statuses: Object.fromEntries(next.tasks.map((task) => [task.id, task.status])),
  };
}

function statusLine(data: ProjectDTO) {
  const agents = data.agents.filter((agent) => agent.provider !== "human").length;
  const done = data.tasks.filter((task) => task.status === "done").length;
  const total = data.tasks.length;
  const base = `You're coordinating ${agents} agents · ${done} of ${total} tasks complete.`;
  if (total > 0 && done === total) {
    return `${base} This run is finished. Read the outputs, or reset the example. Reset does not call Claude or GPT.`;
  }
  if (done === 0 && data.events.length === 0) {
    return `${base} Nothing runs until you press Run.`;
  }
  return base;
}

export function Dashboard({
  initial,
  projects: initialProjects,
  missingSetup,
  email,
  runsLeft,
}: {
  initial: ProjectDTO;
  projects: ProjectOption[];
  missingSetup: string[];
  email: string;
  runsLeft: number;
}) {
  const [data, setData] = useState(initial);
  const [projects, setProjects] = useState(initialProjects);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menu, setMenu] = useState<null | "beta" | "settings">(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [toast, setToast] = useState<{ tone: "danger" | "ok"; text: string } | null>(null);
  const [remaining, setRemaining] = useState(runsLeft);
  const [resetting, setResetting] = useState(false);
  const [pulseRunId, setPulseRunId] = useState<string | null>(null);
  const hintDismissed = useFlag(HINT_KEY);
  const metAgents = useFlag(MET_KEY);
  const seen = useRef(initial.events.map((event) => event.id).join(","));
  const previousStatus = useRef<Record<string, string>>(
    Object.fromEntries(initial.tasks.map((task) => [task.id, task.status])),
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const applyProject = useCallback((next: ProjectDTO) => {
    const observed = observeStatuses(next, previousStatus.current);
    previousStatus.current = observed.statuses;
    seen.current = next.events.map((event) => event.id).join(",");
    if (observed.expandedId) setExpandedTaskId(observed.expandedId);
    if (observed.approvalId) setApprovalId(observed.approvalId);
    setData(next);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!pulseRunId) return;
    const timer = setTimeout(() => setPulseRunId(null), 4000);
    return () => clearTimeout(timer);
  }, [pulseRunId]);

  useEffect(() => {
    const projectId = initial.id;
    let cancelled = false;

    async function poll() {
      const eventsRes = await fetch(`/api/projects/${projectId}/events`);
      if (!eventsRes.ok || cancelled) return;
      const events = (await eventsRes.json()) as ActivityEventDTO[];
      const signature = events.map((event) => event.id).join(",");
      if (signature === seen.current) return;
      const projectRes = await fetch(`/api/projects/${projectId}`);
      if (!projectRes.ok || cancelled) return;
      const project = (await projectRes.json()) as ProjectDTO;
      applyProject({ ...project, events });
    }

    const timer = setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyProject, initial.id]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggleAgent = useCallback((id: string) => {
    setExpandedAgentId((current) => (current === id ? null : id));
    queueMicrotask(() => writeFlag(MET_KEY, true));
  }, []);

  async function refresh() {
    const [projectRes, eventsRes] = await Promise.all([
      fetch(`/api/projects/${data.id}`),
      fetch(`/api/projects/${data.id}/events`),
    ]);
    if (!projectRes.ok) {
      setToast({ tone: "danger", text: "Could not refresh the project. Check the dev server, then try the action again." });
      return null;
    }
    const project = (await projectRes.json()) as ProjectDTO;
    const events = eventsRes.ok ? ((await eventsRes.json()) as ActivityEventDTO[]) : project.events;
    const next = { ...project, events };
    applyProject(next);
    return next;
  }

  async function run(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    setPendingId(taskId);
    setExpandedTaskId(taskId);
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === taskId ? { ...item, status: "running", output: null } : item,
      ),
      agents: current.agents.map((agent) =>
        agent.id === task?.agentId ? { ...agent, status: "working" } : agent,
      ),
    }));
    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      const body = (await response.json()) as { error?: string; task?: { status: string } };
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${body.error ?? "Run failed"}. Open the task to copy the error, or press Retry when you want another attempt.`,
        });
      } else if (data.agents.find((agent) => agent.id === task?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      const next = await refresh();
      const updated = next?.tasks.find((item) => item.id === taskId);
      if (updated?.status === "awaiting_approval") setApprovalId(taskId);
    } catch {
      setToast({
        tone: "danger",
        text: "Could not reach the server. The run was not confirmed. Check the dev server before pressing Run again.",
      });
      await refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function decide(approved: boolean, note: string) {
    if (!approvalId) return;
    const response = await fetch(`/api/tasks/${approvalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved, note }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setToast({
        tone: "danger",
        text: `${body.error ?? "Could not save the decision"}. The gate is unchanged. Try again.`,
      });
      return;
    }
    setApprovalId(null);
    await refresh();
  }

  async function saveContext(name: string, brief: string) {
    const response = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brief }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setToast({
        tone: "danger",
        text: `${body.error ?? "Could not save shared context"}. Your previous brief is still in use. Try again.`,
      });
      return;
    }
    setContextOpen(false);
    setProjects((current) => current.map((project) => (project.id === data.id ? { ...project, name } : project)));
    await refresh();
  }

  async function switchProject(id: string) {
    if (id === data.id) return;
    const response = await fetch(`/api/projects/${id}`);
    if (!response.ok) {
      setToast({ tone: "danger", text: "Could not open that project. The current board is unchanged." });
      return;
    }
    const project = (await response.json()) as ProjectDTO;
    applyProject(project);
    setApprovalId(null);
    setExpandedTaskId(null);
    setRerunId(null);
    setPulseRunId(null);
    const url = new URL(window.location.href);
    url.searchParams.set("project", id);
    window.history.replaceState(null, "", url);
  }

  async function confirmRerun() {
    if (!rerunId) return;
    setRerunning(true);
    setPendingId(rerunId);
    setExpandedTaskId(rerunId);
    try {
      const response = await fetch(`/api/tasks/${rerunId}/rerun`, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${body.error ?? "Could not re-run"}. Refresh the board before trying again.`,
        });
        await refresh();
        return;
      }
      const rerunTask = data.tasks.find((item) => item.id === rerunId);
      if (data.agents.find((agent) => agent.id === rerunTask?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      setRerunId(null);
      const next = await refresh();
      const updated = next?.tasks.find((item) => item.status === "awaiting_approval");
      if (updated) setApprovalId(updated.id);
    } catch {
      setToast({ tone: "danger", text: "Could not reach the server. The re-run was not confirmed." });
    } finally {
      setRerunning(false);
      setPendingId(null);
    }
  }

  async function addTask(input: NewTaskInput) {
    try {
      const response = await fetch(`/api/projects/${data.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as { error?: string; task?: TaskDTO; project?: ProjectDTO };
      if (!response.ok || !body.project || !body.task) {
        return body.error ?? "Could not add the task. The board is unchanged.";
      }
      applyProject(body.project);
      setExpandedTaskId(body.task.id);
      requestAnimationFrame(() => {
        document.querySelector(`[data-task-id="${body.task?.id}"]`)?.scrollIntoView({ block: "nearest" });
      });
      return null;
    } catch {
      return "Could not reach the server. The task was not added.";
    }
  }

  async function resetDemo() {
    setResetting(true);
    try {
      const response = await fetch(`/api/projects/${data.id}/reset`, { method: "POST" });
      const body = (await response.json()) as ProjectDTO & { error?: string };
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${body.error ?? "Could not reset the demo"}. The board is unchanged. Try again.`,
        });
        return;
      }
      applyProject(body);
      setProjects((current) => current.map((project) => (project.id === body.id ? { ...project, name: body.name } : project)));
      setApprovalId(null);
      setExpandedTaskId(null);
      setContextOpen(false);
      setConfirmReset(false);
      setMenu(null);
      setPulseRunId(null);
    } catch {
      setToast({ tone: "danger", text: "Could not reach the server. The reset was not confirmed." });
    } finally {
      setResetting(false);
    }
  }

  function highlightFirstRun() {
    const first = data.tasks[0];
    const node = document.querySelector('[data-task-index="0"]');
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    if (first?.status === "pending") {
      setExpandedTaskId(first.id);
      setPulseRunId(first.id);
    }
  }

  async function copyError(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setToast({ tone: "ok", text: "Copied the error. Paste it into Give feedback if you want." });
    } catch {
      setToast({ tone: "danger", text: "Could not copy. Select the error text and copy it manually." });
    }
  }

  const waiting = data.tasks.find((task) => task.status === "awaiting_approval") ?? null;
  const approvalTask = data.tasks.find((task) => task.id === approvalId) ?? null;
  const first = data.tasks[0];
  const ranTask = !!first && first.status !== "pending";
  const approved = data.events.some((event) => event.type === "approved") || data.tasks.some((task) => task.requiresApproval && task.status === "done");

  return (
    <div className="flex h-full min-h-0 flex-col bg-base text-ink">
      <SetupBanner missing={missingSetup} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-4 w-0.5 bg-thread" aria-hidden />
          <p className="text-xs font-semibold tracking-[0.22em]">ARIADNE</p>
          <span className="text-ink-dim" aria-hidden>
            ·
          </span>
          <label className="min-w-0">
            <span className="sr-only">Project</span>
            <select
              value={data.id}
              onChange={(event) => void switchProject(event.target.value)}
              className="max-w-56 truncate bg-base px-2 py-1 text-sm font-semibold text-ink ring-1 ring-white/15"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div ref={menuRef} className="flex flex-wrap items-center gap-2">
          <p className="max-w-40 truncate text-xs text-ink-dim" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => {
              void fetch("/api/auth/sign-out", { method: "POST" }).then(() => {
                window.location.href = "/sign-in";
              });
            }}
            className="px-2 py-1 text-sm ring-1 ring-white/15 hover:ring-thread"
          >
            Sign out
          </button>
          <div className="relative">
            <button
              type="button"
              aria-expanded={menu === "beta"}
              onClick={() => setMenu((current) => (current === "beta" ? null : "beta"))}
              className="px-2 py-1 text-xs font-semibold tracking-[0.14em] text-thread ring-1 ring-thread/60"
            >
              Beta
            </button>
            {menu === "beta" ? (
              <div className="absolute right-0 z-20 mt-2 w-72 bg-raised p-3 text-sm leading-normal ring-1 ring-white/10">
                <p className="font-semibold leading-tight">What&apos;s beta</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-dim">
                  <li>Sign in with email and password. Each account gets {DAILY_MODEL_RUNS} model runs a day.</li>
                  <li>Scout calls Claude and Maker calls GPT only after you press Run.</li>
                  <li>Reset demo clears outputs and does not call the models.</li>
                  <li>Tasks are this seeded workflow, not a builder.</li>
                  <li>Agents can be wrong. You approve before the last build continues.</li>
                </ul>
                <a href="/feedback" className="mt-3 inline-block text-thread hover:text-thread-bright">
                  Read feedback
                </a>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              setFeedbackOpen(true);
            }}
            className="px-2 py-1 text-sm ring-1 ring-white/15 hover:ring-thread"
          >
            Give feedback
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              setContextOpen(true);
            }}
            className="px-2 py-1 text-sm ring-1 ring-white/15 hover:ring-thread"
          >
            Shared context
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="Settings"
              aria-expanded={menu === "settings"}
              aria-haspopup="menu"
              onClick={() => setMenu((current) => (current === "settings" ? null : "settings"))}
              className="px-2 py-1 text-sm ring-1 ring-white/15 hover:ring-thread"
            >
              Settings
            </button>
            {menu === "settings" ? (
              <div role="menu" className="absolute right-0 z-20 mt-2 w-64 bg-raised p-2 ring-1 ring-white/10">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    setConfirmReset(true);
                  }}
                  className="w-full px-2 py-2 text-left text-sm hover:bg-panel"
                >
                  Reset demo
                </button>
                <p className="px-2 pb-2 text-xs leading-normal text-ink-dim">
                  Returns every task to pending and clears outputs. Does not call Claude or GPT.
                </p>
              </div>
            ) : null}
          </div>
          {activityOpen ? null : (
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              className="px-2 py-1 text-sm text-thread ring-1 ring-thread/50"
            >
              Activity
            </button>
          )}
        </div>
      </header>
      <p className="border-b border-white/10 px-4 py-2 text-sm leading-normal text-ink-dim">
        {statusLine(data)} {remaining} model {remaining === 1 ? "run" : "runs"} left today.
      </p>
      <WelcomeOverlay
        metAgents={metAgents}
        ranTask={ranTask}
        approved={approved}
        canHighlightRun={first?.status === "pending"}
        onRunDemo={highlightFirstRun}
      />
      <main
        className={`grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:overflow-hidden ${
          activityOpen ? "xl:grid-cols-[220px_minmax(0,1fr)_300px]" : "xl:grid-cols-[220px_minmax(0,1fr)]"
        }`}
      >
        <AgentColumn agents={data.agents} tasks={data.tasks} expandedId={expandedAgentId} onToggle={toggleAgent} />
        <RegionBoundary name="Workflow">
          <TaskColumn
            tasks={data.tasks}
            agents={data.agents}
            events={data.events}
            expandedId={expandedTaskId}
            pendingId={pendingId}
            pulseRunId={pulseRunId}
            showDependencyHint={!hintDismissed}
            onDismissHint={() => writeFlag(HINT_KEY, true)}
            onToggle={(id) => setExpandedTaskId((current) => (current === id ? null : id))}
            onRun={(id) => void run(id)}
            onRerun={setRerunId}
            onReview={setApprovalId}
            onCopyError={(message) => void copyError(message)}
            onAdd={addTask}
          />
        </RegionBoundary>
        {activityOpen ? (
          <RegionBoundary name="Activity">
            <ActivityFeed
              events={data.events}
              tasks={data.tasks}
              waitingTask={waiting}
              onReview={() => waiting && setApprovalId(waiting.id)}
              onRetry={(id) => void run(id)}
              onHide={() => setActivityOpen(false)}
              missions={<BetaMissions />}
            />
          </RegionBoundary>
        ) : null}
      </main>
      <footer className="border-t border-white/10 px-4 py-2 text-xs leading-normal text-ink-dim">
        Scout and Maker are AI agents and can make mistakes. Nothing ships without your approval.
      </footer>
      {approvalTask ? (
        <ApprovalModal task={approvalTask} tasks={data.tasks} onClose={() => setApprovalId(null)} onDecide={decide} />
      ) : null}
      {contextOpen ? (
        <ContextDrawer
          key={`${data.name}\n${data.brief}`}
          name={data.name}
          brief={data.brief}
          onClose={() => setContextOpen(false)}
          onSave={saveContext}
        />
      ) : null}
      {feedbackOpen ? <FeedbackModal onClose={() => setFeedbackOpen(false)} /> : null}
      {rerunId ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-base/80 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="rerun-title" className="w-full max-w-md bg-raised p-5 ring-1 ring-thread/50">
            <h2 id="rerun-title" className="text-lg font-semibold leading-tight">
              Re-run this task
            </h2>
            <p className="mt-2 text-sm leading-normal text-ink-dim">
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
              <button type="button" onClick={() => setRerunId(null)} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                disabled={rerunning}
                onClick={() => void confirmRerun()}
                className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) disabled:opacity-50"
              >
                {rerunning ? "Re-running" : "Re-run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmReset ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-base/80 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="w-full max-w-md bg-raised p-5 ring-1 ring-white/10">
            <h2 id="reset-title" className="text-lg font-semibold leading-tight">
              Reset demo
            </h2>
            <p className="mt-2 text-sm leading-normal text-ink-dim">
              Tasks return to pending. Outputs and activity are cleared. The example name and brief are restored.
              Claude and GPT are not called.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmReset(false)} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => void resetDemo()}
                className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) disabled:opacity-50"
              >
                {resetting ? "Resetting" : "Reset demo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className={`fixed right-4 bottom-14 z-50 max-w-sm px-4 py-3 text-sm leading-normal ring-1 ${
            toast.tone === "ok" ? "bg-raised text-ok ring-ok/40" : "bg-raised text-danger ring-danger/50"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
