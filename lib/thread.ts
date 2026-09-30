/*
  Pure helpers for the Red Thread views. Everything here is derived from the project,
  task and event data the Board and Tree already load. Nothing calls a model.
*/
import { directDependencies } from "@/lib/depends";
import { handoffFromEvent, previewChips } from "@/lib/handoff-preview";
import { handName } from "@/lib/hands";
import { orderedLineageTasks } from "@/lib/lineage";
import { displayModel, hideModelIds } from "@/lib/model-label";
import { composeUserPrompt, packageDependencyOutputs, type HandoffInput } from "@/lib/prompt";
import { dependenciesMet, taskNumber } from "@/lib/task-rules";
import type { ActivityEventDTO, AgentDTO, ProjectDTO, TaskDTO } from "@/lib/types";

/* ---------- agents ---------- */

const AGENT_COLORS = ["var(--color-agent-1)", "var(--color-agent-2)", "var(--color-agent-3)", "var(--color-agent-4)"];

export type AgentTone = { name: string; initial: string; color: string; human: boolean };

export function agentTone(agent: AgentDTO | undefined, agents: AgentDTO[]): AgentTone {
  if (!agent) return { name: "Unassigned", initial: "?", color: "var(--color-thread-dim)", human: false };
  const human = agent.provider === "human";
  const initial = (agent.name.trim()[0] ?? "?").toUpperCase();
  if (human) return { name: agent.name, initial, color: "var(--color-gate)", human };
  const index = agents.filter((item) => item.provider !== "human").findIndex((item) => item.id === agent.id);
  return { name: agent.name, initial, color: AGENT_COLORS[Math.max(0, index) % AGENT_COLORS.length], human };
}

export function agentOf(task: TaskDTO | undefined, agents: AgentDTO[]): AgentDTO | undefined {
  if (!task) return undefined;
  return agents.find((agent) => agent.id === task.agentId);
}

export function isHumanTask(task: TaskDTO, agents: AgentDTO[]): boolean {
  return agentOf(task, agents)?.provider === "human";
}

/** "Claude" / "GPT" in lower case, as a quiet mono tag. Never a raw model id. */
export function modelTag(task: TaskDTO, agents: AgentDTO[]): string | null {
  const agent = agentOf(task, agents);
  return displayModel(task.model ?? agent?.model, agent?.provider)?.toLowerCase() ?? null;
}

/* ---------- time ---------- */

export function clock(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "5:02" without the meridiem, for dense ledgers. */
export function clockShort(value: string | null | undefined): string | null {
  const full = clock(value);
  return full ? full.replace(/\s?[AP]\.?M\.?$/i, "") : null;
}

export function durationSeconds(task: TaskDTO): number | null {
  if (!task.startedAt || !task.completedAt) return null;
  const start = Date.parse(task.startedAt);
  const end = Date.parse(task.completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function stopwatch(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return null;
  const seconds = Math.floor(totalSeconds);
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function since(value: string | null | undefined, now: number): number | null {
  if (!value || !now) return null;
  const start = Date.parse(value);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function roughMinutes(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/* ---------- sizes + words ---------- */

export function charsLabel(chars: number): string {
  if (chars >= 1000) return `${(chars / 1000).toFixed(chars >= 10000 ? 0 : 1)}k chars`;
  return `${chars} chars`;
}

export function groupDigits(value: number): string {
  return value.toLocaleString("en-US");
}

const VERBS =
  /^(research|draft|write|review|build|create|make|approve|design|plan|summari[sz]e|critique|check|edit|outline|test|find|map|collect|gather|compare|analy[sz]e|produce|prepare|polish|revise|rewrite|ship|publish|sign off on|decide on|decide)\s+/i;

/** The object of a step title: "Draft landing page copy" → "landing page copy". */
export function objectOf(title: string): string {
  const stripped = title.trim().replace(VERBS, "").replace(/^(the|a|an|our|your)\s+/i, "");
  return (stripped || title).trim().toLowerCase();
}

function listItems(output: string): string[] {
  return output
    .split(/\n/)
    .filter((line) => /^\s{0,3}(\d+[.)]|[-*•])\s+/.test(line))
    .map((line) => line.replace(/^\s{0,3}(\d+[.)]|[-*•])\s+/, "").trim());
}

function plainText(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

/** What a finished step carries forward, in a few words: "5 angles", "landing page copy", "review". */
export function carriedNoun(task: TaskDTO, agents: AgentDTO[]): string {
  if (isHumanTask(task, agents)) return `approved ${objectOf(task.title)}`;
  const first = task.title.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (["review", "critique", "check"].includes(first)) return "review";
  const output = task.output ?? "";
  const items = output && !/^#{1,3}\s/m.test(output) ? listItems(output).length : 0;
  if (items >= 2) {
    const match = task.instructions.match(new RegExp(`\\b${items}\\s+(?:[a-z-]+\\s+){0,3}?([a-z]+s)\\b`, "i"));
    if (match) return `${items} ${match[1].toLowerCase()}`;
  }
  return objectOf(task.title);
}

/** One word for legends: "angles", "copy", "review". */
export function shortNoun(task: TaskDTO, agents: AgentDTO[]): string {
  const noun = carriedNoun(task, agents).replace(/^\d+\s+/, "").replace(/^approved\s+/, "");
  const words = noun.split(/\s+/);
  return words[words.length - 1] ?? noun;
}

export type OutputGist = { lead: string | null; rest: string };

/** A one-line reading of an output for a card: bold lead + the gist. */
export function outputGist(task: TaskDTO, agents: AgentDTO[]): OutputGist | null {
  const output = task.output?.trim();
  if (!output) return null;
  const lines = output.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const heading = lines.find((line) => /^#{1,3}\s/.test(line));
  const verdict = lines.find((line) => /^(\*\*)?verdict\b/i.test(line));
  if (verdict) {
    return { lead: "Verdict:", rest: plainText(verdict.replace(/^(\*\*)?verdict(\*\*)?\s*[:—-]?\s*(\*\*)?/i, "")) };
  }
  if (heading) {
    const rest = lines.find((line) => line !== heading && !/^#/.test(line) && !/^(\d+[.)]|[-*•])\s/.test(line));
    return { lead: plainText(heading), rest: rest ? plainText(rest) : "" };
  }
  const items = listItems(output);
  if (items.length >= 2) {
    const noun = carriedNoun(task, agents);
    const gist = items.map((item) => plainText(item).split(/\s+[—–-]\s+|:\s/)[0]).join(" · ");
    return { lead: `${noun.charAt(0).toUpperCase()}${noun.slice(1)}.`, rest: gist };
  }
  return { lead: null, rest: previewChips(output, 2).join(" ") };
}

/* ---------- context carried ---------- */

export const SECTION_COLORS = ["#1f1a14", "#2f3b4c", "#6b4f2a", "#b3302a", "#3f5a4a", "#5b3f5e", "#8a5b06"];

export type PacketSection = {
  key: string;
  kind: "brief" | "input" | "instructions" | "note";
  label: string;
  legend: string;
  text: string;
  chars: number;
  color: string;
  task?: TaskDTO;
  agentName?: string;
};

export type Carried = {
  target: TaskDTO;
  targetAgent: AgentDTO | undefined;
  human: boolean;
  /** Every task whose output this step receives (done or not yet). */
  sources: TaskDTO[];
  /** Only the sources that have finished. */
  arrived: TaskDTO[];
  /** Did the handoff already happen? */
  handed: boolean;
  sections: PacketSection[];
  packet: string;
  chars: number;
  handoffAt: string | null;
};

function changeNote(instructions: string): string | null {
  const marker = "Human requested changes:";
  const index = instructions.lastIndexOf(marker);
  if (index < 0) return null;
  const note = instructions.slice(index + marker.length).trim();
  return note || null;
}

/**
 * Mirrors lib/agents.ts: an AI step receives the brief, its direct dependencies' outputs and its
 * instructions (composeUserPrompt); a human gate receives every finished upstream output
 * (packageDependencyOutputs over the transitive dependencies).
 */
export function carriedInto(task: TaskDTO, project: ProjectDTO): Carried {
  const agents = project.agents;
  const byId = new Map(project.tasks.map((item) => [item.id, { ...item, dependsOn: JSON.stringify(item.dependsOn) }]));
  const targetAgent = agentOf(task, agents);
  const human = targetAgent?.provider === "human";
  const sources = human
    ? orderedLineageTasks(task.id, project.tasks).filter((item) => item.id !== task.id)
    : directDependencies(JSON.stringify(task.dependsOn), byId).map(
        (item) => project.tasks.find((source) => source.id === item.id) as TaskDTO,
      );
  const arrived = sources.filter((item) => item.status === "done");
  const handed = ["running", "done", "awaiting_approval", "failed"].includes(task.status);
  const shown = handed || human ? arrived : sources;
  const handoffs: HandoffInput[] = shown.map((item) => ({
    agentName: agentOf(item, agents)?.name ?? "Unassigned",
    taskTitle: item.title,
    output: item.output ?? "",
  }));

  const sections: PacketSection[] = [];
  let color = 0;
  // The door: a hand's prompt starts with the brief; at a knot you judge against it
  // too, so it is shown there as well (the packaged gate output itself is unchanged).
  sections.push({
    key: "brief",
    kind: "brief",
    label: human ? "The door · your brief" : "Shared brief",
    legend: "brief",
    text: project.brief,
    chars: project.brief.length,
    color: SECTION_COLORS[color++],
  });
  shown.forEach((item, index) => {
    const text = handoffs[index].output;
    sections.push({
      key: item.id,
      kind: "input",
      label: `${handoffs[index].agentName} — ${carriedNoun(item, agents)}`,
      legend: shortNoun(item, agents),
      text,
      chars: text.length,
      color: SECTION_COLORS[color++ % SECTION_COLORS.length],
      task: item,
      agentName: handoffs[index].agentName,
    });
  });
  const note = changeNote(task.instructions);
  if (human && note) {
    sections.push({ key: "note", kind: "note", label: "Changes you requested", legend: "your note", text: note, chars: note.length, color: "#8a5b06" });
  }
  if (!human) {
    sections.push({
      key: "instructions",
      kind: "instructions",
      label: "Step instructions",
      legend: "instructions",
      text: task.instructions,
      chars: task.instructions.length,
      color: "#978c7c",
    });
  }

  let packet: string;
  if (human) {
    packet =
      task.status === "awaiting_approval" && task.output
        ? task.output
        : note
          ? `${packageDependencyOutputs(handoffs)}\n\n## Changes you requested\n${note}`
          : packageDependencyOutputs(handoffs);
  } else {
    packet = composeUserPrompt({ brief: project.brief, instructions: task.instructions, handoffs });
  }

  const handoffEvent = project.events
    .filter((event) => event.type === "handoff" && event.taskId === task.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  return {
    target: task,
    targetAgent,
    human,
    sources,
    arrived,
    handed,
    sections,
    packet: shown.length === 0 && human ? "" : packet,
    chars: shown.length === 0 && human ? 0 : packet.length,
    handoffAt: handoffEvent?.createdAt ?? null,
  };
}

/** Chars that came from upstream work (excludes the step's own instructions). */
export function inputChars(carried: Carried): number {
  return carried.sections.filter((section) => section.kind !== "instructions").reduce((sum, section) => sum + section.chars, 0);
}

export type BeadText = { lead: string; label: string };

/** "Odysseus handed Daedalus" + "brief + 5 angles · 1.4k chars". */
export function beadText(carried: Carried, project: ProjectDTO): BeadText {
  const agents = project.agents;
  const to = carried.human ? "You" : (carried.targetAgent?.name ?? "the next step");
  const list = carried.handed || carried.human ? carried.arrived : carried.sources;
  const fromNames = [...new Set(list.map((item) => agentOf(item, agents)?.name ?? "Unassigned"))];
  const what =
    list.length === 0
      ? "brief"
      : list.length === 1
        ? `${carried.human ? "" : "brief + "}${carriedNoun(list[0], agents)}`
        : `${list.length} inputs`;
  if (!carried.handed) {
    const gate = carried.sources.find((item) => isHumanTask(item, agents) && item.status !== "done");
    // The nearest unfinished source is the one actually holding this step up.
    const blocker = [...carried.sources].reverse().find((item) => item.status !== "done");
    const when = gate
      ? "on approval"
      : blocker
        ? `when ${taskNumber(blocker.id, project.tasks)} is spun`
        : "when you press Run";
    const noun = carried.human
      ? "Everything spun upstream"
      : list.length === 1
        ? carriedNoun(list[0], agents)
        : list.length === 0
          ? "The brief"
          : `${list.length} inputs`;
    return { lead: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} goes to ${to}`, label: when };
  }
  const size = charsLabel(inputChars(carried));
  if (carried.human && list.length > 1) return { lead: "The whole thread reaches you", label: `${what} · ${size}` };
  const lead = list.length === 0 ? `The brief reaches ${to}` : `${fromNames.join(" + ")} handed ${to}`;
  return { lead, label: `${what} · ${size}` };
}

/** The lines a bead's hover peek shows: the brief, then quotes from each input. */
export function peekLines(carried: Carried, limit = 4): { lines: string[]; more: string | null } {
  const lines: string[] = [];
  const brief = carried.sections.find((section) => section.kind === "brief");
  if (brief) lines.push(`Shared brief (${groupDigits(brief.chars)} chars)`);
  const inputs = carried.sections.filter((section) => section.kind === "input" || section.kind === "note");
  let hidden = 0;
  for (const section of inputs) {
    const chips = previewChips(section.text, 2).map((chip) => `“${plainText(chip)}”`);
    if (inputs.length > 1) chips.unshift(`${section.label} (${groupDigits(section.chars)} chars)`);
    for (const chip of chips) {
      if (lines.length < limit) lines.push(chip);
      else hidden += 1;
    }
  }
  const total = inputs.reduce((sum, section) => sum + Math.max(0, section.text.split(/\n+/).filter(Boolean).length - 2), 0);
  const more = hidden > 0 || total > 0 ? `+ ${Math.max(hidden, total)} more lines in the full handoff` : null;
  return { lines, more };
}

/* ---------- the knot ---------- */

export type KnotInput = { task: TaskDTO; agent: AgentDTO | undefined; noun: string; gist: string; chars: number };

export type Knot = {
  task: TaskDTO;
  inputs: KnotInput[];
  artifact: TaskDTO | null;
  reviewers: TaskDTO[];
  unlocks: TaskDTO[];
  resets: TaskDTO[];
  rerunFirst: TaskDTO[];
  openedAt: string | null;
  carried: Carried;
};

export function knotFor(task: TaskDTO, project: ProjectDTO): Knot {
  const agents = project.agents;
  const tasks = project.tasks;
  const provider = (item: TaskDTO) => agentOf(item, agents)?.provider;
  const direct = (item: TaskDTO) =>
    item.dependsOn.flatMap((id) => {
      const found = tasks.find((candidate) => candidate.id === id);
      return found ? [found] : [];
    });
  const carried = carriedInto(task, project);
  const inputs = carried.arrived.map((item) => {
    const gist = outputGist(item, agents);
    return {
      task: item,
      agent: agentOf(item, agents),
      noun: carriedNoun(item, agents),
      gist: gist ? [gist.lead, gist.rest].filter(Boolean).join(" ") : "",
      chars: item.output?.length ?? 0,
    };
  });

  // Same roots lib/agents.ts decideTask() rewinds to when you request changes.
  const directDeps = direct(task);
  const roots = (directDeps.length > 0 ? directDeps : [task]).map((item) => {
    const parent = direct(item).find((candidate) => provider(candidate) !== "human");
    return parent ?? item;
  });
  const rootIds = new Set(roots.map((item) => item.id));
  const wipe = new Set<string>([task.id]);
  const visit = (id: string) => {
    for (const item of tasks) {
      if (wipe.has(item.id) && item.id !== id) continue;
      if (!item.dependsOn.includes(id)) continue;
      wipe.add(item.id);
      visit(item.id);
    }
  };
  for (const root of roots) {
    wipe.add(root.id);
    visit(root.id);
  }
  const resets = tasks.filter((item) => wipe.has(item.id));
  const artifact = roots.find((item) => item.id !== task.id) ?? null;
  const reviewers = directDeps.filter((item) => !rootIds.has(item.id));
  const unlocks = tasks.filter((item) => item.dependsOn.includes(task.id));
  const opened = project.events
    .filter((event) => event.type === "approval_requested" && event.taskId === task.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  return {
    task,
    inputs,
    artifact,
    reviewers,
    unlocks,
    resets,
    rerunFirst: roots.filter((item) => item.id !== task.id),
    openedAt: opened?.createdAt ?? task.startedAt,
    carried,
  };
}

export type ArtifactPreview = { eyebrow: string; title: string; body: string | null };

export function artifactPreview(task: TaskDTO | null, agents: AgentDTO[]): ArtifactPreview | null {
  if (!task?.output) return null;
  const lines = task.output.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const headingIndex = lines.findIndex((line) => /^#{1,3}\s/.test(line));
  if (headingIndex >= 0) {
    const body = lines.slice(headingIndex + 1).find((line) => !/^#/.test(line) && !/^(\d+[.)]|[-*•])\s/.test(line));
    return { eyebrow: objectOf(task.title), title: plainText(lines[headingIndex]), body: body ? plainText(body) : null };
  }
  const gist = outputGist(task, agents);
  return { eyebrow: objectOf(task.title), title: gist?.lead ?? plainText(lines[0] ?? ""), body: gist?.rest ?? null };
}

export type ReviewFlags = { reviewer: string; verdict: string | null; flags: string[] };

export function reviewFlags(reviewers: TaskDTO[], agents: AgentDTO[]): ReviewFlags | null {
  const reviewer = reviewers.find((item) => item.output);
  if (!reviewer?.output) return null;
  const lines = reviewer.output.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const verdictLine = lines.find((line) => /^(\*\*)?verdict\b/i.test(line));
  const flags = listItems(reviewer.output).map(plainText);
  return {
    reviewer: agentOf(reviewer, agents)?.name ?? "The reviewer",
    verdict: verdictLine ? plainText(verdictLine.replace(/^(\*\*)?verdict(\*\*)?\s*[:—-]?\s*(\*\*)?\s*/i, "")) : null,
    flags,
  };
}

/* ---------- board status ---------- */

export type ThreadState = "spun" | "spinning" | "knot" | "frayed" | "ready" | "unspun";

export function threadState(task: TaskDTO, tasks: TaskDTO[], pendingId?: string | null): ThreadState {
  if (task.status === "running" || pendingId === task.id) return "spinning";
  if (task.status === "done") return "spun";
  if (task.status === "awaiting_approval") return "knot";
  if (task.status === "failed") return "frayed";
  if (dependenciesMet(task, tasks)) return "ready";
  return "unspun";
}

export function stepRange(tasks: TaskDTO[], all: TaskDTO[]): string {
  const numbers = tasks.map((task) => taskNumber(task.id, all)).filter((n) => n > 0).sort((a, b) => a - b);
  if (numbers.length === 0) return "";
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (numbers.length === 1) return `step ${numbers[0]}`;
  return contiguous ? `steps ${numbers[0]}–${numbers[numbers.length - 1]}` : `steps ${numbers.join(", ")}`;
}

/* ---------- ledger ---------- */

export type LedgerEntry = { id: string; at: string; text: string; tone: "knot" | "fail" | "plain" | "thread"; taskId: string | null };

function payloadText(event: ActivityEventDTO, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function ledgerEntries(project: ProjectDTO): LedgerEntry[] {
  const events = [...project.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const entries: LedgerEntry[] = [];
  const agents = project.agents;
  const task = (event: ActivityEventDTO) => project.tasks.find((item) => item.id === event.taskId);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const target = task(event);
    const title = target?.title ?? "";
    if (event.type === "handoff") {
      const group = [event];
      while (events[index + 1]?.type === "handoff" && events[index + 1]?.taskId === event.taskId) {
        group.push(events[index + 1]);
        index += 1;
      }
      const details = group.map((item) => handoffFromEvent(item, project.tasks, agents)).filter((item) => item !== null);
      const from = [...new Set(details.map((item) => item.from))].reverse().join(", ");
      const to = details[0]?.to ?? agentOf(target, agents)?.name ?? title;
      const source = details.length === 1 ? project.tasks.find((item) => item.id === details[0].fromTaskId) : undefined;
      const what = details.length > 1 ? `${details.length} inputs` : source ? carriedNoun(source, agents) : (details[0]?.title ?? "");
      entries.push({
        id: event.id,
        at: event.createdAt,
        text: details.length > 0 ? `${from} → ${to} · ${what}` : hideModelIds(event.message),
        tone: "thread",
        taskId: event.taskId,
      });
      continue;
    }
    const who = agentOf(target, agents)?.name ?? handName(payloadText(event, "agent") ?? "An agent");
    let text = hideModelIds(event.message);
    let tone: LedgerEntry["tone"] = "plain";
    if (event.type === "approval_requested") {
      text = `Knot opened for You · ${title}`;
      tone = target?.status === "awaiting_approval" ? "knot" : "plain";
    } else if (event.type === "started") {
      text = `${who} started ${title}`;
    } else if (event.type === "completed") {
      const seconds = target && target.status === "done" ? durationSeconds(target) : null;
      text = `${who} finished ${title}${seconds !== null ? ` · ${seconds < 60 ? `${seconds}s` : stopwatch(seconds)}` : ""}`;
    } else if (event.type === "approved") {
      text = `You tied off ${title}`;
      tone = "thread";
    } else if (event.type === "failed" && event.payload?.reason === "stuck_run_reclaimed") {
      text = title ? `Recovered a stuck run · ${title} can run again` : text;
    } else if (event.type === "failed") {
      text = title ? `Frayed: ${title}` : text;
      tone = "fail";
    } else if (event.type === "note" && event.payload?.decision === "changes_requested") {
      const note = payloadText(event, "note");
      text = `${payloadText(event, "approver") ?? "You"} asked for changes on ${title}${note ? `: “${note.length > 140 ? `${note.slice(0, 139)}…` : note}”` : ""}`;
    } else if (event.type === "note" && event.payload?.kind === "rerun_cleared") {
      text = `Rerun cleared what came after ${title}`;
    }
    entries.push({ id: event.id, at: event.createdAt, text, tone, taskId: event.taskId });
  }
  return entries;
}

/**
 * Why a task's latest run failed, from the failed event's structured payload. Events
 * written before the payload column existed fall back to their plain message.
 */
export function failureReason(taskId: string, events: ActivityEventDTO[]): string | null {
  const event = events.find((item) => item.type === "failed" && item.taskId === taskId);
  if (!event) return null;
  return payloadText(event, "error") ?? event.message;
}
