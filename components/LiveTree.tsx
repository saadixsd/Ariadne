"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CoordinationTree } from "@/components/CoordinationTree";
import { AccountButton, TopBar } from "@/components/TopBar";
import { TreeDetailRail } from "@/components/TreeDetailRail";
import { ContextDrawer } from "@/components/ContextDrawer";
import { RunCost } from "@/components/Critique";
import { fetchProject, runFailureNext, runFailureText, serverError, useProjectPoll } from "@/components/project-poll";
import { acceptPolledProject } from "@/lib/board-project";
import { isSpinning } from "@/lib/poll-schedule";
import { workflowTree } from "@/lib/live-tree";
import { hideModelIds } from "@/lib/model-label";
import { canRunTask, cascadeFrom, dependenciesMet, taskNumber } from "@/lib/task-rules";
import { agentOf, threadState } from "@/lib/thread";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

type NextAction = {
  pill: string;
  tone: "knot" | "thread" | "fail" | "plain";
  text: ReactNode;
  action?: { label: string; taskId: string; kind: "review" | "run" };
};

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function nextAction(project: ProjectDTO): NextAction {
  const tasks = project.tasks;
  const total = tasks.length;
  if (total === 0) return { pill: "no steps", tone: "plain", text: "No steps yet. Add one from the Board." };
  const pill = (task: TaskDTO) => `step ${taskNumber(task.id, tasks)} of ${total}`;
  const who = (task: TaskDTO) => agentOf(task, project.agents)?.name ?? "the next step";
  const waiting = tasks.find((task) => task.status === "awaiting_approval");
  if (waiting) {
    const unlock = tasks.find((task) => task.dependsOn.includes(waiting.id));
    return {
      pill: pill(waiting),
      tone: "knot",
      text: (
        <>
          The thread stops at your knot — <b className="font-semibold text-ink">{waiting.title}</b>.
          {unlock ? ` Approving lets ${who(unlock)} ${lowerFirst(unlock.title)}.` : " Approving finishes the thread."}
        </>
      ),
      action: { label: "Review →", taskId: waiting.id, kind: "review" },
    };
  }
  const running = tasks.find((task) => task.status === "running");
  if (running) {
    return {
      pill: pill(running),
      tone: "thread",
      text: (
        <>
          {who(running)} is spinning <b className="font-semibold text-ink">{running.title}</b>. The thread moves on when it lands.
        </>
      ),
    };
  }
  const failed = tasks.find((task) => task.status === "failed");
  if (failed) {
    return {
      pill: pill(failed),
      tone: "fail",
      text: (
        <>
          The thread frayed at <b className="font-semibold text-ink">{failed.title}</b>. Respin it when you are ready.
        </>
      ),
      action: canRunTask(failed, tasks) ? { label: "Respin", taskId: failed.id, kind: "run" } : undefined,
    };
  }
  const ready = tasks.find((task) => canRunTask(task, tasks));
  if (ready) {
    return {
      pill: pill(ready),
      tone: "plain",
      text: (
        <>
          Next on the thread: <b className="font-semibold text-ink">{ready.title}</b> for {who(ready)}. Nothing runs until you press Run.
        </>
      ),
      action: { label: agentOf(ready, project.agents)?.provider === "human" ? "Open the knot" : "Run", taskId: ready.id, kind: "run" },
    };
  }
  const locked = tasks.find((task) => task.status === "pending" && !dependenciesMet(task, tasks));
  if (locked) return { pill: pill(locked), tone: "plain", text: <>{locked.title} unlocks when the steps it needs are spun.</> };
  return { pill: `${total} of ${total}`, tone: "thread", text: <>Every step is spun. The deliverable is at the centre.</> };
}

export function LiveTree({
  initial,
  projects,
  runsLeft,
  authorName,
  accountInitial,
}: {
  initial: ProjectDTO;
  projects: { id: string; name: string }[];
  runsLeft: number;
  authorName: string;
  accountInitial: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [remaining, setRemaining] = useState(runsLeft);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [toast, setToast] = useState<{ tone: "danger" | "ok"; text: string } | null>(null);
  const selectedIdRef = useRef(initial.id);
  const busy = useRef(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => workflowTree(data), [data]);
  const detailNode = tree.nodes.find((node) => node.id === detailId) ?? null;

  const onPolled = useCallback((project: ProjectDTO, requestedId: string) => {
    if (busy.current) return;
    if (!acceptPolledProject(selectedIdRef.current, requestedId) || project.id !== requestedId) return;
    setData(project);
  }, []);
  // Same ladder as the Board: 2s while spinning, backing off to 60s idle, paused when hidden, 304 if unchanged.
  const poll = useProjectPoll({ projectId: data.id, spinning: isSpinning(data.tasks, pendingId), onChange: onPolled });

  async function load() {
    const projectId = selectedIdRef.current;
    poll.kick();
    const result = await fetchProject(projectId);
    if (!acceptPolledProject(selectedIdRef.current, projectId) || result.kind !== "changed") return null;
    const project = result.project;
    if (!acceptPolledProject(selectedIdRef.current, project.id)) return null;
    setData(project);
    return project;
  }

  // Same save as the Board's shared-context drawer: PATCH name + brief, then re-read the project.
  async function saveBrief(name: string, brief: string): Promise<string | null> {
    const projectId = data.id;
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brief }),
    }).catch(() => null);
    if (!response) return "Could not reach the server. Your previous brief is still in use.";
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!acceptPolledProject(selectedIdRef.current, projectId)) return "That project changed before the brief could be saved.";
    if (!response.ok) return body.error ?? "Could not save the brief";
    setEditingBrief(false);
    setData((current) => (current.id === projectId ? { ...current, name, brief } : current));
    await load().catch(() => null);
    return null;
  }

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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
      if (!response.ok) {
        const failure = runFailureText("Run failed", response.status, await serverError(response));
        if (response.status === 429) setRemaining(0);
        setToast({
          tone: "danger",
          text: `${hideModelIds(failure)} ${runFailureNext(response.status)}`,
        });
      } else if (data.agents.find((agent) => agent.id === task?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      const next = await load();
      const updated = next?.tasks.find((item) => item.id === taskId);
      if (updated?.status === "awaiting_approval") setDetailId(taskId);
    } catch {
      setToast({
        tone: "danger",
        text: "Could not reach the server, so the run was not confirmed. Check your connection, then reload the page before pressing Run again.",
      });
      await load().catch(() => null);
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
      const next = await load();
      if (response.ok || saved(next)) return;
      setToast({
        tone: "danger",
        text: `${body?.error ?? "Could not save the decision"}. The gate is unchanged. Try again.`,
      });
    } catch {
      const next = await load().catch(() => null);
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
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (response.status === 429) setRemaining(0);
        setToast({
          tone: "danger",
          text: `${hideModelIds(runFailureText("Could not re-run", response.status, body.error ?? null))} ${runFailureNext(response.status)}`,
        });
        await load();
        return;
      }
      const rerunTask = data.tasks.find((item) => item.id === rerunId);
      if (data.agents.find((agent) => agent.id === rerunTask?.agentId)?.provider !== "human") {
        setRemaining((count) => Math.max(0, count - 1));
      }
      setRerunId(null);
      const next = await load();
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

  const next = nextAction(data);
  const states = data.tasks.map((task) => threadState(task, data.tasks, pendingId));
  const counts = {
    spun: states.filter((state) => state === "spun").length,
    knot: states.filter((state) => state === "knot").length,
    spinning: states.filter((state) => state === "spinning").length,
    frayed: states.filter((state) => state === "frayed").length,
  };
  const unspun = states.length - counts.spun - counts.knot - counts.spinning - counts.frayed;
  const pillTone =
    next.tone === "knot"
      ? "border-gate-line bg-gate-bg text-gate-ink"
      : next.tone === "fail"
        ? "border-danger/30 bg-danger/5 text-danger"
        : next.tone === "thread"
          ? "border-thread-soft bg-raised text-thread"
          : "border-line bg-raised text-ink-dim";

  return (
    <div className="flex h-full min-h-0 flex-col pb-[env(safe-area-inset-bottom)] text-ink">
      <TopBar
        view="tree"
        projectId={data.id}
        projects={projects}
        onSwitchProject={(id) => {
          window.location.href = `/tree?project=${encodeURIComponent(id)}`;
        }}
        runsLeft={remaining}
      >
        <button type="button" onClick={() => setDetailId("root")} className="rt-btn max-sm:hidden">
          Brief
        </button>
        <div ref={menuRef} className="relative">
          <AccountButton initial={accountInitial} label="Account menu" expanded={menu} onClick={() => setMenu((value) => !value)} />
          {menu ? (
            <div role="menu" className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-line bg-raised p-1 shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)]">
              <a role="menuitem" href={`/settings?project=${encodeURIComponent(data.id)}#projects`} className="block rounded-lg px-3 py-2 text-sm hover:bg-panel">
                Manage projects
              </a>
              <a role="menuitem" href={`/settings?project=${encodeURIComponent(data.id)}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-panel">
                Settings
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  void fetch("/api/auth/sign-out", { method: "POST" }).then(() => {
                    router.replace("/sign-in");
                  });
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </TopBar>
      <div data-next-action className="flex min-h-12 flex-wrap items-center gap-x-3.5 gap-y-1 gutter-safe border-b border-line py-2 text-[13.5px] text-ink-dim">
        <span className={`rounded-full border px-[9px] py-[3px] font-mono text-[11.5px] ${pillTone}`}>{next.pill}</span>
        <span className="min-w-0">{next.text}</span>
        {next.action ? (
          <button
            type="button"
            onClick={() => {
              const action = next.action;
              if (!action) return;
              if (action.kind === "review") setDetailId(action.taskId);
              else void run(action.taskId);
            }}
            disabled={next.action.kind === "run" && pendingId !== null}
            className={`rt-btn h-7 px-3 text-xs ${next.action.kind === "review" ? "rt-btn-knot" : "rt-btn-thread"}`}
          >
            {next.action.label}
          </button>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11.5px]" aria-label={`${counts.spun} spun, ${counts.knot} knot, ${unspun} unspun`}>
          {states.map((state, index) => (
            <i
              key={data.tasks[index].id}
              aria-hidden
              className={`inline-block h-[3px] w-[22px] rounded ${
                state === "spun" ? "bg-thread" : state === "knot" ? "bg-gate" : state === "spinning" ? "pulse-status bg-thread" : state === "frayed" ? "bg-danger" : "bg-line-strong"
              }`}
            />
          ))}
          <span className="ml-1.5" aria-hidden>
            {[
              `${counts.spun} spun`,
              counts.spinning ? `${counts.spinning} spinning` : null,
              counts.knot ? `${counts.knot} knot` : null,
              counts.frayed ? `${counts.frayed} frayed` : null,
              `${unspun} unspun`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </div>
      <div className={`grid min-h-0 flex-1 ${detailNode ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_430px]" : "grid-cols-1"}`}>
        <CoordinationTree project={data} pendingId={pendingId} selectedId={detailId} onSelect={(id) => setDetailId((current) => (current === id ? null : id))} />
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
            onEditBrief={() => setEditingBrief(true)}
          />
        ) : null}
      </div>
      {editingBrief ? (
        <ContextDrawer
          key={`${data.id}\n${data.name}\n${data.brief}`}
          name={data.name}
          brief={data.brief}
          onClose={() => setEditingBrief(false)}
          onSave={saveBrief}
        />
      ) : null}
      {rerunId ? (
        <div className="modal-safe fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rerun-title"
            className="w-full max-w-md rounded-2xl border border-line bg-raised p-5"
          >
            <h2 id="rerun-title" className="font-serif text-[26px] leading-tight">
              Re-run this task
            </h2>
            <p className="mt-2 text-sm leading-normal text-ink-dim">
              These steps return to pending; their current output stays in the run history. Only the task you re-run calls an agent, for 1 run. The rest stay pending until you press Run.
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
                className="rt-btn rt-btn-thread gap-1"
              >
                {rerunning ? "Re-running" : "Re-run"}
                {rerunning || data.agents.find((agent) => agent.id === data.tasks.find((task) => task.id === rerunId)?.agentId)?.provider === "human" ? null : <RunCost />}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className={`fixed right-4 bottom-6 z-50 max-w-sm rounded-xl bg-raised px-4 py-3 text-sm leading-normal shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)] ring-1 ${
            toast.tone === "ok" ? "text-thread ring-ok/40" : "text-danger ring-danger/50"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
