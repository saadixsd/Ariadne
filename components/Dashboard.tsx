"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NewTaskInput } from "@/components/AddTaskForm";
import { AgentColumn } from "@/components/AgentColumn";
import { ApprovalModal } from "@/components/ApprovalModal";
import { ContextDrawer } from "@/components/ContextDrawer";
import { FeedbackModal } from "@/components/FeedbackModal";
import { HandoffInspector } from "@/components/HandoffInspector";
import { KnotPanel, type KnotPanelHandle } from "@/components/KnotPanel";
import { LineageRail } from "@/components/LineageRail";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { OutputReader } from "@/components/OutputReader";
import { RegionBoundary } from "@/components/RegionBoundary";
import { SetupBanner } from "@/components/SetupBanner";
import { TaskColumn } from "@/components/TaskColumn";
import { AccountButton, TopBar } from "@/components/TopBar";
import { useClocks, useNow } from "@/components/use-now";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { useFlag, writeFlag } from "@/components/client-storage";
import { failureText, fetchProject, serverError, useProjectPoll } from "@/components/project-poll";
import { acceptPolledProject, needsSharedContextPrompt } from "@/lib/board-project";
import { hideModelIds } from "@/lib/model-label";
import { buildLineage } from "@/lib/lineage";
import { cascadeFrom, taskNumber } from "@/lib/task-rules";
import { agentOf, carriedInto, roughMinutes, since } from "@/lib/thread";
import { isSpinning } from "@/lib/poll-schedule";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

export type ProjectOption = { id: string; name: string };

const HINT_KEY = "ariadne.hint.blocked";
const MET_KEY = "ariadne.welcome.met";

function observeStatuses(next: ProjectDTO, previousStatus: Record<string, string>) {
  let expandedId: string | null = null;
  let knotId: string | null = null;
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
    if (task.status === "awaiting_approval") knotId = task.id;
  }
  return {
    expandedId,
    knotId,
    statuses: Object.fromEntries(next.tasks.map((task) => [task.id, task.status])),
  };
}

function HeroStatus({ data }: { data: ProjectDTO }) {
  const now = useNow();
  const done = data.tasks.filter((task) => task.status === "done").length;
  const total = data.tasks.length;
  const waiting = data.tasks.find((task) => task.status === "awaiting_approval");
  const running = data.tasks.find((task) => task.status === "running");
  const failed = data.tasks.find((task) => task.status === "failed");
  let line: React.ReactNode;
  if (waiting) {
    const opened = data.events
      .filter((event) => event.type === "approval_requested" && event.taskId === waiting.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)?.createdAt;
    const waited = roughMinutes(since(opened ?? waiting.startedAt, now));
    line = (
      <>
        <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-gate shadow-[0_0_0_3px_rgba(201,138,18,.18)]" />
        <span>
          The thread is waiting on <b className="font-semibold text-ink">you</b>
          {waited ? ` · ${waited}` : ""}
        </span>
      </>
    );
  } else if (running) {
    line = (
      <>
        <span aria-hidden className="pulse-status h-[9px] w-[9px] rounded-full bg-thread" />
        <span>
          {agentOf(running, data.agents)?.name ?? "An agent"} is spinning step {taskNumber(running.id, data.tasks)}
        </span>
      </>
    );
  } else if (failed) {
    line = <span className="text-danger">The thread frayed at step {taskNumber(failed.id, data.tasks)} · respin it when ready</span>;
  } else if (total > 0 && done === total) {
    line = <span>Every step is spun</span>;
  } else if (done === 0 && data.events.length === 0) {
    line = <span>Nothing runs until you press Run.</span>;
  } else {
    line = <span>The thread is ready for the next step</span>;
  }
  return (
    <div className="text-right">
      <p className="font-serif text-[40px] leading-none">
        {done}
        <span className="text-ink-faint">/{total}</span> spun
      </p>
      <p className="mt-1.5 flex items-center justify-end gap-2 text-[13px] text-ink-dim">{line}</p>
    </div>
  );
}

export function Dashboard({
  initial,
  projects: initialProjects,
  missingSetup,
  email,
  accountInitial,
  accountName = "",
  runsLeft,
}: {
  initial: ProjectDTO;
  projects: ProjectOption[];
  missingSetup: string[];
  email: string;
  accountInitial: string;
  accountName?: string;
  runsLeft: number;
}) {
  const { clock } = useClocks();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [projects, setProjects] = useState(initialProjects);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);
  const knotRef = useRef<KnotPanelHandle>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initial.id);
  const selectedIdRef = useRef(initial.id);
  const [lineageId, setLineageId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menu, setMenu] = useState<null | "account">(null);
  const [toast, setToast] = useState<{ tone: "danger" | "ok"; text: string } | null>(null);
  const [remaining, setRemaining] = useState(runsLeft);
  const [pulseRunId, setPulseRunId] = useState<string | null>(null);
  const hintDismissed = useFlag(HINT_KEY);
  const metAgents = useFlag(MET_KEY);
  const previousStatus = useRef<Record<string, string>>(
    Object.fromEntries(initial.tasks.map((task) => [task.id, task.status])),
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const applyProject = useCallback((next: ProjectDTO) => {
    const observed = observeStatuses(next, previousStatus.current);
    previousStatus.current = observed.statuses;
    if (observed.expandedId && observed.expandedId !== observed.knotId) setExpandedTaskId(observed.expandedId);
    setData(next);
  }, []);

  function rememberProject(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
  }

  function writeProjectUrl(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", id);
    window.history.replaceState(null, "", url);
  }

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

  // Poll only as hard as the moment needs: every 2s while a step spins, backing off
  // to once a minute while idle, paused in a hidden tab, 304 when nothing changed.
  const onPolled = useCallback(
    (project: ProjectDTO, requestedId: string) => {
      if (!acceptPolledProject(selectedIdRef.current, requestedId) || project.id !== requestedId) return;
      applyProject(project);
    },
    [applyProject],
  );
  const poll = useProjectPoll({ projectId: selectedId, spinning: isSpinning(data.tasks, pendingId), onChange: onPolled });

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

  const closeReader = useCallback(() => setReaderId(null), []);

  const toggleAgent = useCallback((id: string) => {
    setExpandedAgentId((current) => (current === id ? null : id));
    queueMicrotask(() => writeFlag(MET_KEY, true));
  }, []);

  // One request (the project already carries its newest 100 events).
  async function refresh() {
    const projectId = selectedIdRef.current;
    poll.kick();
    const result = await fetchProject(projectId);
    if (!acceptPolledProject(selectedIdRef.current, projectId)) return null;
    if (result.kind !== "changed") {
      const text =
        result.kind === "error"
          ? failureText("Could not refresh the project", result.status, result.message)
          : "Could not refresh the project.";
      setToast({ tone: "danger", text: `${text} Reload the page to see the latest state.` });
      return null;
    }
    const next = result.project;
    if (!acceptPolledProject(selectedIdRef.current, next.id)) return null;
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
      const failure = response.ok ? null : failureText("Run failed", response.status, await serverError(response));
      if (!response.ok) {
        setToast({
          tone: "danger",
          text: `${hideModelIds(failure ?? "Run failed")} Open the task to copy the error, or press Retry when you want another attempt.`,
        });
      } else if (data.agents.find((agent) => agent.id === task?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      const next = await refresh();
      // A failed refresh must not hide why the run failed.
      if (failure && !next) setToast({ tone: "danger", text: `${hideModelIds(failure)} The board could not be refreshed either. Reload the page, then try again.` });
      const updated = next?.tasks.find((item) => item.id === taskId);
      if (updated?.status === "awaiting_approval") focusKnot();
    } catch {
      setToast({
        tone: "danger",
        text: "Could not reach the server, so the run was not confirmed. Check your connection, then reload the page before pressing Run again.",
      });
      await refresh().catch(() => null);
    } finally {
      setPendingId(null);
    }
  }

  function focusKnot() {
    requestAnimationFrame(() => knotRef.current?.focusDecision());
  }

  async function decide(id: string, approved: boolean, note: string) {
    const saved = (project: ProjectDTO | null) => {
      const current = project?.tasks.find((task) => task.id === id);
      return approved ? current?.status === "done" : current?.status === "pending";
    };
    try {
      const response = await fetch(`/api/tasks/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, note }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const next = await refresh();
      if (response.ok || saved(next)) {
        setApprovalId(null);
        return;
      }
      setToast({
        tone: "danger",
        text: `${body?.error ?? "Could not save the decision"}. The gate is unchanged. Try again.`,
      });
    } catch {
      const next = await refresh().catch(() => null);
      if (saved(next)) {
        setApprovalId(null);
        return;
      }
      setToast({
        tone: "danger",
        text: "Could not save the decision. The gate is unchanged. Try again.",
      });
    }
  }

  async function saveContext(name: string, brief: string, options?: { quiet?: boolean }): Promise<string | null> {
    const projectId = data.id;
    if (!acceptPolledProject(selectedIdRef.current, projectId)) {
      return "That project changed before the brief could be saved.";
    }
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brief }),
    });
    const body = (await response.json()) as { error?: string };
    if (!acceptPolledProject(selectedIdRef.current, projectId)) {
      return "That project changed before the brief could be saved.";
    }
    if (!response.ok) {
      const message = body.error ?? "Could not save shared context";
      if (!options?.quiet) {
        setToast({
          tone: "danger",
          text: `${message}. Your previous brief is still in use. Try again.`,
        });
      }
      return message;
    }
    setContextOpen(false);
    setData((current) => (current.id === projectId ? { ...current, name, brief } : current));
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, name } : project)));
    await refresh();
    return null;
  }

  async function switchProject(id: string) {
    if (id === selectedIdRef.current) return;
    const previous = selectedIdRef.current;
    rememberProject(id);
    const result = await fetchProject(id).catch(() => null);
    if (!acceptPolledProject(selectedIdRef.current, id)) return;
    if (result?.kind !== "changed") {
      rememberProject(previous);
      setToast({ tone: "danger", text: "Could not open that project. The current board is unchanged." });
      return;
    }
    const project = result.project;
    if (!acceptPolledProject(selectedIdRef.current, id) || project.id !== id) return;
    applyProject(project);
    setApprovalId(null);
    setExpandedTaskId(null);
    setRerunId(null);
    setPulseRunId(null);
    writeProjectUrl(id);
  }

  async function createProject(name: string, brief: string) {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brief }),
      });
      const body = (await response.json()) as ProjectDTO & { error?: string };
      if (!response.ok || !body.id) return body.error ?? "Could not create the project.";
      setProjects((current) =>
        current.some((project) => project.id === body.id) ? current : [...current, { id: body.id, name: body.name }],
      );
      rememberProject(body.id);
      applyProject(body);
      setApprovalId(null);
      setExpandedTaskId(null);
      setRerunId(null);
      setPulseRunId(null);
      writeProjectUrl(body.id);
      return null;
    } catch {
      return "Could not reach the server. The project was not created.";
    }
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
          text: `${hideModelIds(body.error ?? "Could not re-run")}. Refresh the board before trying again.`,
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
      if (updated) focusKnot();
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

  const approvalTask = data.tasks.find((task) => task.id === approvalId) ?? null;
  const lineageSteps = lineageId ? buildLineage(data, lineageId) : null;
  const first = data.tasks[0];
  const ranTask = !!first && first.status !== "pending";
  const approved =
    data.events.some((event) => event.type === "approved") ||
    data.tasks.some((task) => task.requiresApproval && task.status === "done");
  const emptyOwnBrief = needsSharedContextPrompt(data);

  const handoffTask = handoffId ? data.tasks.find((task) => task.id === handoffId) : undefined;
  const readerTask = readerId ? data.tasks.find((task) => task.id === readerId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col text-ink">
      <SetupBanner missing={missingSetup} />
      <TopBar
        view="board"
        projectId={selectedId}
        projects={projects}
        onSwitchProject={(id) => void switchProject(id)}
        runsLeft={remaining}
      >
        <button
          type="button"
          onClick={() => {
            const button = document.querySelector<HTMLButtonElement>("[data-add-step]");
            button?.scrollIntoView({ block: "center" });
            button?.click();
          }}
          className="rt-btn rt-btn-ghost max-sm:hidden"
        >
          ＋ Step
        </button>
        <button type="button" onClick={() => setContextOpen(true)} className="rt-btn max-md:hidden">
          Brief
        </button>
        <div ref={menuRef} className="relative">
          <AccountButton
            initial={accountInitial}
            label={`Account menu for ${email}`}
            expanded={menu === "account"}
            onClick={() => setMenu((current) => (current === "account" ? null : "account"))}
          />
          {menu === "account" ? (
            <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-line bg-raised p-1 shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)]">
              {accountName ? <p className="truncate px-3 pt-2 font-serif text-[17px] leading-tight">{accountName}</p> : null}
              <p className="truncate px-3 pt-2 pb-1.5 font-mono text-[11px] text-ink-faint" title={email}>
                {email}
              </p>
              {[
                { label: "Shared context", run: () => setContextOpen(true) },
                { label: "New project", run: () => setNewProjectOpen(true) },
                { label: "Manage projects", run: () => void router.push(`/settings?project=${encodeURIComponent(data.id)}#projects`) },
                { label: "Settings", run: () => void router.push(`/settings?project=${encodeURIComponent(data.id)}`) },
                { label: "Give feedback", run: () => setFeedbackOpen(true) },
                {
                  label: "Sign out",
                  run: () =>
                    void fetch("/api/auth/sign-out", { method: "POST" }).then(() => {
                      window.location.href = "/sign-in";
                    }),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    item.run();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </TopBar>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] tall-xl:overflow-hidden">
        <WelcomeOverlay
          metAgents={metAgents}
          ranTask={ranTask}
          approved={approved}
          canHighlightRun={first?.status === "pending"}
          onRunDemo={highlightFirstRun}
        />
        <section className="gutter-safe mx-auto grid w-full max-w-[1920px] shrink-0 grid-cols-1 items-end gap-x-10 gap-y-4 pt-[22px] pb-[18px] md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="eyebrow">Project{clock(data.createdAt) ? ` · started ${clock(data.createdAt)}` : ""}</p>
            <h1 className="mt-1 font-serif text-[38px] leading-none tracking-[-0.015em] break-words sm:text-[46px]">{data.name}</h1>
            <div className="mt-2.5 flex max-w-[780px] flex-wrap items-baseline gap-x-3 gap-y-1">
              {data.brief.trim() ? (
                <p className="line-clamp-2 min-w-0 flex-1 font-serif text-[17px] leading-[1.35] text-ink-dim italic">
                  “{data.brief.trim()}”
                </p>
              ) : (
                <p className="font-serif text-[17px] text-ink-faint italic">No brief yet. Every agent reads it before it works.</p>
              )}
              <button
                type="button"
                onClick={() => setContextOpen(true)}
                className="text-xs font-semibold whitespace-nowrap text-thread underline decoration-1 underline-offset-[3px] hover:text-thread-bright"
              >
                The thread every agent reads · edit
              </button>
            </div>
          </div>
          <HeroStatus data={data} />
        </section>
        <main className="gutter-safe mx-auto grid w-full max-w-[1920px] flex-none grid-cols-1 gap-[22px] lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_400px] 2xl:grid-cols-[252px_minmax(0,1fr)_436px] tall-xl:min-h-0 tall-xl:flex-1">
          <AgentColumn
            project={data}
            expandedId={expandedAgentId}
            onToggle={toggleAgent}
            onSelectTask={(id) => {
              setExpandedTaskId(id);
              requestAnimationFrame(() =>
                document.querySelector(`[data-task-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }),
              );
            }}
          />
          <RegionBoundary name="Workflow">
            <TaskColumn
              project={data}
              expandedId={expandedTaskId}
              pendingId={pendingId}
              pulseRunId={pulseRunId}
              showDependencyHint={!hintDismissed}
              onDismissHint={() => writeFlag(HINT_KEY, true)}
              onToggle={(id) => setExpandedTaskId((current) => (current === id ? null : id))}
              onRun={(id) => void run(id)}
              onRerun={setRerunId}
              onTieOff={() => knotRef.current?.focusDecision()}
              onCopyError={(message) => void copyError(message)}
              onAdd={addTask}
              lineageTaskId={lineageId}
              onOpenLineage={(id) => setLineageId((current) => (current === id ? null : id))}
              onOpenHandoff={setHandoffId}
              onOpenReader={setReaderId}
            />
          </RegionBoundary>
          <RegionBoundary name="Decision">
            <div className="flex min-h-0 flex-col max-lg:order-2 lg:col-span-2 xl:col-span-1">
              <KnotPanel
                project={data}
                selectedId={expandedTaskId}
                pendingId={pendingId}
                handle={knotRef}
                onDecide={decide}
                onOpenPacket={setApprovalId}
                onOpenHandoff={setHandoffId}
                onRun={(id) => void run(id)}
                onRerun={setRerunId}
                onOpenReader={setReaderId}
              />
            </div>
          </RegionBoundary>
        </main>
      </div>
      {approvalTask ? (
        <ApprovalModal
          task={approvalTask}
          tasks={data.tasks}
          onClose={() => setApprovalId(null)}
          onDecide={(approvedNow, note) => decide(approvalTask.id, approvedNow, note)}
        />
      ) : null}
      {lineageSteps ? (
        <LineageRail key={lineageId ?? "lineage"} steps={lineageSteps} onClose={() => setLineageId(null)} />
      ) : null}
      {contextOpen ? (
        <ContextDrawer
          key={`${data.id}\n${data.name}\n${data.brief}`}
          name={data.name}
          brief={data.brief}
          prompting={emptyOwnBrief}
          onClose={() => setContextOpen(false)}
          onSave={(name, brief) => saveContext(name, brief, { quiet: true })}
        />
      ) : null}
      {newProjectOpen ? (
        <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreate={createProject} />
      ) : null}
      {feedbackOpen ? <FeedbackModal onClose={() => setFeedbackOpen(false)} /> : null}
      {readerTask ? <OutputReader key={readerTask.id} task={readerTask} project={data} onClose={closeReader} /> : null}
      {handoffTask ? (
        <HandoffInspector
          key={handoffTask.id}
          carried={carriedInto(handoffTask, data)}
          project={data}
          onClose={() => setHandoffId(null)}
        />
      ) : null}
      {rerunId ? (
        <div className="modal-safe fixed inset-0 z-40 flex items-end justify-center bg-ink/30 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="rerun-title" className="w-full max-w-md bg-raised rounded-2xl p-5 ring-1 ring-thread/50">
            <h2 id="rerun-title" className="font-serif text-[26px] font-normal leading-tight">
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
              <button type="button" onClick={() => setRerunId(null)} className="rt-btn rt-btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                disabled={rerunning}
                onClick={() => void confirmRerun()}
                className="rt-btn rt-btn-thread"
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
          className={`fixed right-4 bottom-6 z-50 max-w-sm rounded-xl px-4 py-3 shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)] text-sm leading-normal ring-1 ${
            toast.tone === "ok" ? "bg-raised text-thread ring-ok/40" : "bg-raised text-danger ring-danger/50"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
