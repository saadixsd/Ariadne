import "server-only";
import { cleanCitations, stripTracking } from "@/lib/critique";
import { CHECKER_PLAYBOOK, WRITER_PLAYBOOK } from "@/lib/playbooks.generated";
import { estimateCostUsd } from "@/lib/cost";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { syncAgentStatus } from "@/lib/agent-status";
import { appendChangeNote, latestChangeNote } from "@/lib/change-notes";
import { dependentTasks, directDependencies, transitiveDependencies, unmetDependencyIds } from "@/lib/depends";
import { safeErrorMessage, TaskRunError } from "@/lib/errors";
import { handName } from "@/lib/hands";
import { assertMaxLength } from "@/lib/input-caps";
import { briefWithSources } from "@/lib/sources";
import { MAX_NOTE_CHARS, MAX_OUTPUT_TOKENS_ANTHROPIC, MAX_OUTPUT_TOKENS_OPENAI } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { isStuck, reclaimStuckTasks } from "@/lib/reclaim";
import { emitEvent, emitEvents, preserveLegacyOutputs, recordRun, type EventStructure } from "@/lib/run-history";
import { releaseModelRun, reserveModelRun, utcDay } from "@/lib/usage";
import {
  composeSystemPrompt,
  composeUserPrompt,
  packageDependencyOutputs,
  type HandoffInput,
} from "@/lib/prompt";
import { serializeTask } from "@/lib/serialize";

type TaskWithAgent = {
  id: string;
  title: string;
  status: string;
  output: string | null;
  dependsOn: string;
  agent: { name: string };
};

async function emit(
  projectId: string,
  type: string,
  message: string,
  taskId: string,
  structure?: EventStructure,
) {
  await emitEvent(projectId, type, message, taskId, structure);
}

function toHandoff(task: TaskWithAgent): HandoffInput {
  return {
    agentName: handName(task.agent.name),
    taskTitle: task.title,
    output: task.output ?? "",
  };
}

function modelForProvider(provider: string): string {
  if (provider === "openai") return process.env.OPENAI_MODEL?.trim() ?? "";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() ?? "";
  return "";
}

function assertConfigured(provider: string, model: string) {
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    if (!model) throw new Error("ANTHROPIC_MODEL is not set");
    return;
  }
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    if (!model) throw new Error("OPENAI_MODEL is not set");
    return;
  }
  throw new Error(`Unknown provider "${provider}"`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const READING_RULES =
  "Read the pages behind your facts in full with the fetch tool, not just search snippets. When a page loads its data from a linked data file (a .js, .json or .csv it references), fetch that file and read the numbers there. When credible sources give different values, report each value with its source and date instead of picking one. Never present a total you computed yourself as a source's figure: if you add numbers up, say it is your own count and quote the inputs.";

/** Added to every writer call, so projects made before this rule get it too. */
const WRITER_RULES = (tools: "fetch" | "search" | "none") =>
  `\n\n(Today is ${today()}. ${
    tools === "fetch"
      ? `Web search and page fetch are available: use them to look up current facts before you answer. ${READING_RULES}`
      : tools === "search"
        ? "Web search is available: use it to look up current facts before you answer."
        : "Web search is not available for this run; answer from the brief, the sources and what you know."
  } Use the whole brief (title, goal, need, deliverable and files) together; if anything is ambiguous, take the most reasonable reading in that context, state it in one line starting "Assumption:" at the top, then answer fully. Never ask clarifying questions instead of answering. Answer the question directly. Cite your sources inline, next to each claim, as Markdown links to the page you used. Say clearly when you are uncertain about a fact, and why. Never refuse or stop because you lack access to something: give your best sourced answer and mark what is uncertain. Do not mention which AI model or company is behind you.)`;

const ANTHROPIC_SEARCH = { type: "web_search_20250305", name: "web_search", max_uses: 2 } as const;
// Provider-side fetch: the page is read on the provider's servers. The cap keeps the
// response the Worker has to parse bounded (CPU), while fitting a mid-size data file.
const ANTHROPIC_FETCH = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, max_content_tokens: 8_000 } as const;

/** Opening lines where the writer narrates its own process ("Now I have enough. Let me draft…"). */
const NARRATION = /^(?:now |ok(?:ay)?[,.]? |great[,.]? |perfect[,.]? )?(?:let me|i'll|i will|i have|i've|i now have|i'm going to|i need to|based on (?:my|the) (?:research|search(?:es)?))\b[^\n]{0,200}$/i;

function textOf(content: Anthropic.ContentBlock[]) {
  // With tools the model narrates between calls ("I'll search for…"). Keep only the
  // text written after the last tool result: that is the answer.
  let last = -1;
  content.forEach((block, i) => {
    if (block.type !== "text") last = i;
  });
  // Search results come back as structured citations on text blocks; show them inline as
  // Markdown links (once per URL in a row) so the reader and the checker can open them.
  let previous = "";
  const text = content
    .slice(last + 1)
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => {
      const urls = Array.from(new Set((block.citations ?? []).map((c) => ("url" in c ? String(c.url ?? "") : "")).filter(Boolean)));
      const links = urls.filter((u) => u !== previous).map((u) => {
        const host = u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        return ` [${host}](${u})`;
      });
      if (urls.length) previous = urls[urls.length - 1];
      if (!links.length || /\]\(https?:\/\//.test(block.text)) return block.text;
      // Keep the sentence's trailing punctuation/newlines after the links.
      const m = block.text.match(/^([\s\S]*?)([.,;:]?\s*)$/);
      return `${m?.[1] ?? block.text}${links.join("")}${m?.[2] ?? ""}`;
    })
    .join("")
    .trim();
  const lines = text.split("\n");
  while (lines.length && (NARRATION.test(lines[0].trim()) || /^-{3,}$/.test(lines[0].trim()) || !lines[0].trim())) lines.shift();
  return lines.join("\n").trim() || text;
}

/** Which provider-side tools ran (names and URLs only), for the Worker log. */
function toolTrace(content: Anthropic.ContentBlock[]) {
  return content
    .filter((block) => block.type === "server_tool_use")
    .map((block) => {
      const input = (block as { name: string; input: Record<string, unknown> }).input ?? {};
      return `${(block as { name: string }).name}:${String(input.url ?? input.query ?? "").slice(0, 120)}`;
    });
}

/** Token usage of one model call (all continuations summed), stored on the run for cost tracking. */
export type CallUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; searches: number; fetches: number };
const emptyUsage = (): CallUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0, fetches: 0 });
type CallResult = { text: string; usage: CallUsage };

function addAnthropicUsage(total: CallUsage, u: Anthropic.Usage | undefined) {
  if (!u) return;
  // Cache writes bill at 1.25x input; count them that way so the cost estimate stays honest.
  total.inputTokens += (u.input_tokens ?? 0) + Math.ceil((u.cache_creation_input_tokens ?? 0) * 1.25);
  total.cacheReadTokens += u.cache_read_input_tokens ?? 0;
  total.outputTokens += u.output_tokens ?? 0;
  const st = u.server_tool_use as { web_search_requests?: number; web_fetch_requests?: number } | null | undefined;
  total.searches += st?.web_search_requests ?? 0;
  total.fetches += st?.web_fetch_requests ?? 0;
}

/** Wall-clock budget for one writer or checker call, all retries included (the request must finish well inside platform limits). */
const CALL_BUDGET_MS = 170_000;
const MAX_CONTINUATIONS = 3;

/** The system prompt (playbook first) as one cached block: continuations and the next call within 5 minutes read it at a tenth of the price. */
const cachedSystem = (system: string): Anthropic.TextBlockParam[] => [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
const left = (deadline: number) => deadline - Date.now();

function anthropicEffort(): Anthropic.OutputConfig | undefined {
  const e = process.env.ANTHROPIC_EFFORT ?? "medium";
  return e === "off" ? undefined : { effort: e as NonNullable<Anthropic.OutputConfig["effort"]> };
}

async function anthropicWithTools(client: Anthropic, model: string, system: string, user: string, tools: Anthropic.ToolUnion[], mode: "fetch" | "search", deadline: number, usage: CallUsage): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user + WRITER_RULES(mode) }];
  const output_config = anthropicEffort();
  const create = (withTools: boolean) =>
    client.messages.create(
      { model, max_tokens: MAX_OUTPUT_TOKENS_ANTHROPIC, system: cachedSystem(system), messages, ...(withTools ? { tools } : {}), ...(output_config ? { output_config } : {}) },
      { timeout: Math.max(5_000, left(deadline)) },
    );
  let response = await create(true);
  addAnthropicUsage(usage, response.usage);
  const trace = toolTrace(response.content);
  // Long tool use pauses the turn, and a turn can end on tool results with no answer yet.
  // Continue (bounded) until there is answer text after the last tool block.
  for (let i = 0; i < MAX_CONTINUATIONS && left(deadline) > 25_000; i++) {
    const text = textOf(response.content);
    const paused = response.stop_reason === "pause_turn";
    if (!paused && text) break;
    messages.push({ role: "assistant", content: response.content });
    if (!paused) messages.push({ role: "user", content: "Write the full answer now from what you found, with inline citations." });
    // Last continuation, or little time left: no tools, so it must write.
    const finalTurn = i === MAX_CONTINUATIONS - 1 || left(deadline) < 60_000 || !paused;
    response = await create(!finalTurn);
    addAnthropicUsage(usage, response.usage);
    trace.push(...toolTrace(response.content));
  }
  console.log("[ariadne] writer tools", JSON.stringify({ mode, trace, usage, stop: response.stop_reason }));
  const text = stripTracking(textOf(response.content));
  if (!text) throw new Error("empty response with tools");
  return text;
}

function isOutage(error: unknown) {
  const status = (error as { status?: number }).status;
  return status !== undefined && (status >= 500 || status === 429);
}

/**
 * Odysseus writes with Anthropic's server-side web search and page fetch. Both run on
 * Anthropic's side, so the Worker waits (wall time, not CPU). One budget covers every
 * attempt: if fetch is refused (4xx) it retries with search only, then plain, but only
 * while time is left. ANTHROPIC_WEB_SEARCH=off skips both; ANTHROPIC_WEB_FETCH=off skips fetch.
 */
async function callAnthropic(model: string, system: string, user: string): Promise<CallResult> {
  const deadline = Date.now() + CALL_BUDGET_MS;
  const usage = emptyUsage();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: CALL_BUDGET_MS });
  if (process.env.ANTHROPIC_WEB_SEARCH !== "off") {
    if (process.env.ANTHROPIC_WEB_FETCH !== "off") {
      try {
        return { text: await anthropicWithTools(client, model, system, user, [ANTHROPIC_SEARCH, ANTHROPIC_FETCH], "fetch", deadline, usage), usage };
      } catch (error) {
        if (isOutage(error) || left(deadline) < 60_000) throw error;
        console.warn("writer page fetch unavailable, trying search only:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
      }
    }
    try {
      return { text: await anthropicWithTools(client, model, system, user, [ANTHROPIC_SEARCH], "search", deadline, usage), usage };
    } catch (error) {
      if (isOutage(error) || left(deadline) < 45_000) throw error;
      console.warn("writer web search unavailable, using plain call:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    }
  }
  const output_config = anthropicEffort();
  const response = await client.messages.create(
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS_ANTHROPIC,
      system: cachedSystem(system),
      messages: [{ role: "user", content: user + WRITER_RULES("none") }],
      ...(output_config ? { output_config } : {}),
    },
    { timeout: Math.max(5_000, left(deadline)) },
  );
  addAnthropicUsage(usage, response.usage);
  const text = stripTracking(textOf(response.content));
  if (!text) throw new Error("The writer returned an empty response");
  return { text, usage };
}

/** Added to every fact-check call (old projects included). */
const CHECKER_RULES = (search: boolean) =>
  `\n\n(Today is ${today()}. ${
    search
      ? "Web search is available for this check, including opening pages: open the source pages and read them in full, not just snippets. When a page loads its data from a linked data file (.js, .json, .csv), open that file. Cite the URLs you used."
      : "Web search is not available for this check."
  } Rules:
- Supported: Evidence must quote, in double quotes, the exact source words that contain the claimed number or name. If you cannot quote it, the verdict is unsupported.
- Never invent arithmetic. A total or count is supported only if a source states that total verbatim. If you compute one, write "Computed: <each input quoted from the source> = <total>" in Evidence and give the verdict unsupported (or wrong if the quoted inputs clearly contradict the claim), never supported.
- Sources disagree: when credible sources give different values, use the verdict "sources disagree" and give each value on its own line in Evidence as: "<exact quote>" — <URL>. List every URL in Source, separated by " ; ".
- If the draft makes more than 12 factual claims, check the 12 that matter most to the user's goal in full; then list the remaining claims briefly under "Not checked in full" with no verdict.
- Start your reply with one line "Data checked: <the single as-of date or timestamp the source shows, or today's date>" and use that same date for every claim.
Do not mention which AI model or company is behind you.)`;

/**
 * Daedalus fact-checks with OpenAI's hosted web search (Responses API) when the model
 * and account allow it. The search runs on OpenAI's side, so the Worker only waits on
 * one fetch (wall time, not CPU). Any failure falls back to the plain call below,
 * which says it cannot search. OPENAI_WEB_SEARCH=off turns it off.
 */
function addOpenAIUsage(total: CallUsage, u: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number; input_tokens_details?: { cached_tokens?: number } | null; prompt_tokens_details?: { cached_tokens?: number } | null } | null | undefined) {
  if (!u) return;
  const cached = u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  total.inputTokens += (u.input_tokens ?? u.prompt_tokens ?? 0) - cached;
  total.cacheReadTokens += cached;
  total.outputTokens += u.output_tokens ?? u.completion_tokens ?? 0;
}

/** Reasoning effort for the checker; low keeps a searched check inside the time budget. */
function openaiEffort() {
  const e = process.env.OPENAI_EFFORT ?? "low";
  return e === "off" ? undefined : (e as "low" | "medium" | "high" | "minimal" | "none");
}

/**
 * Daedalus fact-checks with OpenAI's hosted web search (Responses API). The search and
 * page reads run on OpenAI's side, so the Worker only waits. The searched check gets most
 * of the budget; the plain fallback only runs if enough time is left.
 */
async function callOpenAIWithSearch(client: OpenAI, model: string, system: string, user: string, deadline: number, usage: CallUsage) {
  const effort = openaiEffort();
  const response = await client.responses.create(
    {
      model,
      instructions: system,
      input: user + CHECKER_RULES(true),
      tools: [{ type: "web_search" }],
      max_output_tokens: MAX_OUTPUT_TOKENS_OPENAI,
      ...(effort ? { reasoning: { effort } } : {}),
    },
    { timeout: Math.max(5_000, left(deadline) - 40_000) },
  );
  addOpenAIUsage(usage, response.usage);
  const actions = (response.output ?? [])
    .filter((item) => item.type === "web_search_call")
    .map((item) => {
      const action = (item as { action?: { type?: string; url?: string; query?: string } }).action;
      return `${action?.type ?? "?"}:${String(action?.url ?? action?.query ?? "").slice(0, 120)}`;
    });
  usage.searches += actions.length;
  console.log("[ariadne] checker tools", JSON.stringify({ actions, usage, status: response.status }));
  const text = cleanCitations(response.output_text?.trim() ?? "");
  if (!text) throw new Error("The fact-checker returned an empty response");
  return text;
}

async function callOpenAI(model: string, system: string, user: string): Promise<CallResult> {
  const deadline = Date.now() + CALL_BUDGET_MS;
  const usage = emptyUsage();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: CALL_BUDGET_MS });
  if (process.env.OPENAI_WEB_SEARCH !== "off") {
    try {
      return { text: await callOpenAIWithSearch(client, model, system, user, deadline, usage), usage };
    } catch (error) {
      if (left(deadline) < 30_000) throw error;
      console.warn("web search check unavailable, using plain check:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    }
  }
  const effort = openaiEffort();
  const response = await client.chat.completions.create(
    {
      model,
      max_completion_tokens: MAX_OUTPUT_TOKENS_OPENAI,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user + CHECKER_RULES(false) },
      ],
      ...(effort ? { reasoning_effort: effort } : {}),
    },
    { timeout: Math.max(5_000, left(deadline)) },
  );
  addOpenAIUsage(usage, response.usage);
  const text = cleanCitations(response.choices[0]?.message?.content?.trim() ?? "");
  if (!text) throw new Error("The fact-checker returned an empty response");
  return { text, usage };
}

/** The playbooks (agents/playbooks/*.md, compiled at build time) lead each agent's system prompt. */
async function callProvider(provider: string, model: string, system: string, user: string) {
  if (provider === "anthropic") return callAnthropic(model, `${WRITER_PLAYBOOK}\n\n${system}`, user);
  if (provider === "openai") return callOpenAI(model, `${CHECKER_PLAYBOOK}\n\n${system}`, user);
  throw new Error(`Unknown provider "${provider}"`);
}

class ProviderError extends Error {
  constructor(
    readonly original: unknown,
    readonly tries: number,
  ) {
    super(original instanceof Error ? original.message : "Provider request failed");
  }
}

/** Retries once, but only after a quick failure: a slow one already used the time budget. */
async function withOneRetry(fn: () => Promise<CallResult>): Promise<CallResult & { tries: number }> {
  const t0 = Date.now();
  try {
    return { ...(await fn()), tries: 1 };
  } catch (first) {
    if (Date.now() - t0 > 30_000) throw new ProviderError(first, 1);
    try {
      return { ...(await fn()), tries: 2 };
    } catch (error) {
      throw new ProviderError(error, 2);
    }
  }
}

type RunClaim = { taskId: string; startedAt: Date };

/** Guarded write: only applies while this exact attempt still owns the task. */
async function commitIfOwned(claim: RunClaim, data: Prisma.TaskUpdateManyMutationInput) {
  const updated = await prisma.task.updateMany({
    where: { id: claim.taskId, status: "running", startedAt: claim.startedAt },
    data,
  });
  return updated.count === 1;
}

/**
 * The project's tasks with their agents, plus the project brief, in three queries.
 * Ownership is part of the first query (project of this user that has this task).
 */
async function loadRunContext(taskId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { userId, tasks: { some: { id: taskId } } },
    select: { id: true, brief: true },
  });
  if (!project) return null;
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    include: { agent: true },
  });
  return { project, tasks };
}

/**
 * `dailyLimit` is the account's own model-run cap for today (lib/limits.ts dailyRunLimit:
 * lower during a new account's trial). Defaults to the normal DAILY_MODEL_RUNS.
 */
export async function runTask(taskId: string, userId: string, dailyLimit?: number) {
  let context = await loadRunContext(taskId, userId);
  if (!context) throw new TaskRunError("Task not found", 404);
  // Lazy stuck-run recovery, as before, but only when a loaded task is actually
  // `running` past the timeout (reclaimStuckTasks acts on nothing else); then reload.
  const checkedAt = Date.now();
  if (context.tasks.some((item) => item.status === "running" && isStuck(item, checkedAt))) {
    await reclaimStuckTasks(context.project.id, checkedAt);
    context = await loadRunContext(taskId, userId);
    if (!context) throw new TaskRunError("Task not found", 404);
  }
  const { project, tasks } = context;
  const found = tasks.find((item) => item.id === taskId);
  if (!found) throw new TaskRunError("Task not found", 404);
  const task = { ...found, project };
  if (task.status === "running") throw new TaskRunError("Task is already running", 409);
  if (task.status === "awaiting_approval") {
    throw new TaskRunError("Task is awaiting approval", 409);
  }

  const byId = new Map(tasks.map((item) => [item.id, item]));
  const unmet = unmetDependencyIds(task.dependsOn, byId);
  if (unmet.length > 0) {
    throw new TaskRunError("Dependencies are not done", 409, { unmet });
  }

  const isModel = task.agent.provider !== "human";
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const usageDay = utcDay(startedAt);
  const claim: RunClaim = { taskId: task.id, startedAt };

  // Quota: reserve BEFORE claiming, atomically. If the run later fails, is
  // discarded, or is reclaimed as stuck, the reservation is released, so only
  // successful runs count. Invariant: a model task in `running` holds exactly one
  // reservation on utcDay(startedAt) (lib/reclaim.ts relies on this).
  if (isModel) await reserveModelRun(userId, usageDay, dailyLimit, task.projectId);

  const claimed = await prisma.task.updateMany({
    where: { id: task.id, status: { notIn: ["running", "awaiting_approval"] } },
    data: {
      status: "running",
      startedAt,
      output: null,
      completedAt: null,
      model: null,
    },
  });
  if (claimed.count !== 1) {
    if (isModel) await releaseModelRun(userId, usageDay, task.projectId);
    throw new TaskRunError("Task is already running", 409);
  }

  await prisma.agent.updateMany({
    where: { id: task.agentId },
    data: { status: "working" },
  });

  const sourceTasks =
    task.agent.provider === "human"
      ? transitiveDependencies(task.dependsOn, byId).filter((item) => item.status === "done")
      : directDependencies(task.dependsOn, byId);
  const handoffs = sourceTasks.map(toHandoff);

  // "started" and every "handoff" in one INSERT, in the same order as before.
  await emitEvents([
    {
      projectId: task.projectId,
      type: "started",
      message: `${handName(task.agent.name)} started "${task.title}"`,
      taskId: task.id,
      runId,
      payload: { agent: handName(task.agent.name) },
    },
    ...sourceTasks.map((source) => ({
      projectId: task.projectId,
      type: "handoff",
      message: `Handoff: ${handName(source.agent.name)} handed "${source.title}" to ${handName(task.agent.name)}`,
      taskId: task.id,
      fromTaskId: source.id,
      toTaskId: task.id,
      runId,
      payload: {
        fromAgent: handName(source.agent.name),
        toAgent: handName(task.agent.name),
        fromTitle: source.title,
        toTitle: task.title,
      },
    })),
  ]);

  if (task.agent.provider === "human") {
    const note = latestChangeNote(task.instructions);
    const output = note
      ? `${packageDependencyOutputs(handoffs)}\n\n## Changes you requested\n${note}`
      : packageDependencyOutputs(handoffs);
    const committed = await commitIfOwned(claim, { output, status: "awaiting_approval", model: "human" });
    await recordRun({
      id: runId,
      taskId: task.id,
      projectId: task.projectId,
      outcome: committed ? "succeeded" : "discarded",
      provider: "human",
      model: "human",
      output,
      error: committed ? null : "Task was reclaimed before the gate opened",
      latencyMs: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    });
    if (!committed) throw new TaskRunError("Task changed while the gate was opening. Refresh and try again.", 409);
    await emit(
      task.projectId,
      "approval_requested",
      `Waiting on YOU to approve "${task.title}"`,
      task.id,
      { runId, payload: { gate: true } },
    );
    await syncAgentStatus(task.agentId, task.agent.provider);
    // The row exactly as the guarded commit above wrote it (no re-read).
    return serializeTask({ ...task, status: "awaiting_approval", output, model: "human", startedAt, completedAt: null });
  }

  const model = modelForProvider(task.agent.provider);
  const system = composeSystemPrompt({ name: handName(task.agent.name), role: task.agent.role });
  // Text the user added from their files (lib/sources.ts) rides along with the brief.
  const sources = await prisma.sourceFile.findMany({
    where: { projectId: task.projectId },
    orderBy: { createdAt: "asc" },
    select: { name: true, text: true },
  });
  const user = composeUserPrompt({
    brief: briefWithSources(task.project.brief, sources),
    instructions: task.instructions,
    handoffs,
  });

  const runBase = {
    id: runId,
    taskId: task.id,
    projectId: task.projectId,
    provider: task.agent.provider,
    model: model || null,
    systemPrompt: system,
    prompt: user,
    startedAt,
  };

  let output: string;
  let tries = 1;
  let usage: CallUsage | null = null;
  try {
    assertConfigured(task.agent.provider, model);
    const result = await withOneRetry(() => callProvider(task.agent.provider, model, system, user));
    output = result.text;
    tries = result.tries;
    usage = result.usage;
  } catch (thrown) {
    const error = thrown instanceof ProviderError ? thrown.original : thrown;
    const message = safeErrorMessage(error);
    // Failed runs never count against the daily quota.
    await releaseModelRun(userId, usageDay, task.projectId);
    await recordRun({
      ...runBase,
      outcome: "failed",
      error: message,
      tries: thrown instanceof ProviderError ? thrown.tries : 1,
      latencyMs: Date.now() - startedAt.getTime(),
      completedAt: new Date(),
    });
    const owned = await commitIfOwned(claim, { status: "failed", model: null });
    if (owned) {
      await emit(task.projectId, "failed", `${handName(task.agent.name)} failed "${task.title}": ${message}`, task.id, {
        runId,
        payload: { error: message },
      });
    }
    await syncAgentStatus(task.agentId, task.agent.provider);
    throw new TaskRunError(message, 502);
  }

  const latencyMs = Date.now() - startedAt.getTime();
  const usageFields = usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        toolCalls: usage.searches + usage.fetches,
        costUsd: estimateCostUsd(model, usage),
      }
    : {};
  const status = task.requiresApproval ? "awaiting_approval" : "done";
  const completedAt = status === "done" ? new Date() : null;
  const committed = await commitIfOwned(claim, {
    output,
    status,
    model,
    completedAt,
  });
  if (!committed) {
    // The task was reclaimed as stuck (and its reservation released) while this
    // request was still waiting on the provider. Keep the output in history but
    // do not apply it over whatever happened since.
    await recordRun({
      ...runBase,
      outcome: "discarded",
      output,
      tries,
      ...usageFields,
      latencyMs,
      error: "Finished after the task was recovered as stuck; output kept in history but not applied",
      completedAt: new Date(),
    });
    throw new TaskRunError(
      "This run finished after the task was recovered as stuck. Its output is saved in run history but was not applied. Run the task again.",
      409,
    );
  }
  await recordRun({ ...runBase, outcome: "succeeded", output, tries, ...usageFields, latencyMs, completedAt: new Date() });
  // The agent's model and its status in one write (was: update model, emit, then sync status).
  await syncAgentStatus(task.agentId, task.agent.provider, { model });
  await emit(
    task.projectId,
    status === "done" ? "completed" : "approval_requested",
    status === "done"
      ? `${handName(task.agent.name)} completed "${task.title}"`
      : `Waiting on YOU to approve "${task.title}"`,
    task.id,
    { runId, payload: status === "done" ? { agent: handName(task.agent.name) } : { gate: false } },
  );
  if (status === "done") await openReadyHumanGates(task.projectId, userId, tasks);
  // The row exactly as the guarded commit above wrote it (no re-read).
  return serializeTask({ ...task, status, output, model, startedAt, completedAt });
}

async function openReadyHumanGates(projectId: string, userId: string, known: { id: string; agent: { provider: string } }[]) {
  // Fresh statuses (another run may have finished meanwhile); providers come from the
  // agents already loaded, since a task's agent never changes during a run.
  const provider = new Map(known.map((item) => [item.id, item.agent.provider]));
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, status: true, dependsOn: true, agentId: true },
  });
  const humanAgents = new Set(
    (await humanAgentIds(projectId, tasks.filter((item) => !provider.has(item.id)).map((item) => item.agentId))),
  );
  const byId = new Map(tasks.map((item) => [item.id, item]));
  for (const candidate of tasks) {
    const human = provider.has(candidate.id) ? provider.get(candidate.id) === "human" : humanAgents.has(candidate.agentId);
    if (!human) continue;
    if (candidate.status !== "pending") continue;
    if (unmetDependencyIds(candidate.dependsOn, byId).length > 0) continue;
    await runTask(candidate.id, userId);
  }
}

/** Agents (of tasks added after the run loaded its context) that are the human. Usually no query. */
async function humanAgentIds(projectId: string, agentIds: string[]): Promise<string[]> {
  if (agentIds.length === 0) return [];
  const agents = await prisma.agent.findMany({
    where: { projectId, id: { in: [...new Set(agentIds)] }, provider: "human" },
    select: { id: true },
  });
  return agents.map((agent) => agent.id);
}

export async function rerunTask(taskId: string, userId: string, dailyLimit?: number) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.status !== "done" && task.status !== "failed") {
    throw new TaskRunError("Only a finished or frayed step can be re-run", 409);
  }

  const tasks = await prisma.task.findMany({ where: { projectId: task.projectId } });
  const downstream = dependentTasks(task.id, tasks);
  const wipe = [task, ...downstream];
  // History survives: every output being cleared already has a TaskRun row
  // (older outputs get a `legacy` row here). Task.output only tracks the current run.
  await preserveLegacyOutputs(wipe);
  await prisma.$transaction(
    wipe.map((item) =>
      prisma.task.update({
        where: { id: item.id },
        data: {
          status: "pending",
          output: null,
          startedAt: null,
          completedAt: null,
          model: null,
        },
      }),
    ),
  );
  await emit(
    task.projectId,
    "note",
    `Re-run cleared: ${wipe.map((item) => item.title).join(", ")}`,
    task.id,
    { payload: { kind: "rerun_cleared", taskIds: wipe.map((item) => item.id) } },
  );
  const agentIds = [...new Set(wipe.map((item) => item.agentId))];
  for (const agentId of agentIds) await syncAgentStatus(agentId);
  return runTask(task.id, userId, dailyLimit);
}

/**
 * Per-step Intervene: append a structured note into this model step's instructions
 * (same marker as Ask for changes), then re-run it so the packet includes the note.
 * Downstream steps clear like a normal re-run. Pending steps only store the note
 * for the next Run. Human/knot steps are refused — use the knot note there.
 */
export async function steerTask(taskId: string, note: string, userId: string, dailyLimit?: number) {
  const trimmed = note.trim();
  if (!trimmed) throw new TaskRunError("Write a short note first", 400);
  assertMaxLength("Note", trimmed, MAX_NOTE_CHARS);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.agent.provider === "human") {
    throw new TaskRunError("At the knot, add your note and Ask for changes — Intervene steers a model step.", 409);
  }
  if (task.status === "running") {
    throw new TaskRunError("Wait until this step finishes, then Intervene again.", 409);
  }
  if (task.status === "awaiting_approval") {
    throw new TaskRunError("Open the knot to judge this step.", 409);
  }

  const withNote = appendChangeNote(task.instructions, trimmed);
  await prisma.task.update({ where: { id: task.id }, data: { instructions: withNote } });
  await emit(
    task.projectId,
    "note",
    `You steered "${task.title}": ${trimmed}`,
    task.id,
    { payload: { kind: "step_steer", note: trimmed } },
  );

  // Never spun yet: the note waits for the next Run.
  if (task.status === "pending") {
    return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
  }

  // done / failed: clear this step and downstream, then run it with the note in the packet.
  return rerunTask(task.id, userId, dailyLimit);
}

export async function decideTask(taskId: string, approved: boolean, note: string | undefined, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.status !== "awaiting_approval") {
    throw new TaskRunError("Task is not awaiting approval", 409);
  }

  if (approved) {
    // Tie Off: every flagged claim needs your decision first (own-template threads).
    const { getProject } = await import("@/lib/project");
    const { assertClaimsDecided } = await import("@/lib/workspace-server");
    const dto = await getProject(task.projectId, userId);
    if (dto) await assertClaimsDecided(dto);
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "done", completedAt: new Date() },
    });
    await emit(task.projectId, "approved", `You approved "${task.title}"`, task.id, {
      payload: { decision: "approved", approver: "You" },
    });
    await syncAgentStatus(task.agentId);
    return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
  }

  const trimmed = note?.trim() ?? "";
  if (!trimmed) throw new TaskRunError("A note is required to request changes", 400);
  assertMaxLength("Note", trimmed, MAX_NOTE_CHARS);

  const tasks = await prisma.task.findMany({
    where: { projectId: task.projectId },
    include: { agent: true },
  });
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const direct = directDependencies(task.dependsOn, byId);
  const roots = (direct.length > 0 ? direct : [task]).map((item) => {
    const parent = directDependencies(item.dependsOn, byId).find((candidate) => candidate.agent.provider !== "human");
    return parent ?? item;
  });
  const rootIds = new Set(roots.map((item) => item.id));
  const wipeIds = new Set<string>([task.id]);
  for (const root of roots) {
    wipeIds.add(root.id);
    for (const later of dependentTasks(root.id, tasks)) wipeIds.add(later.id);
  }

  await preserveLegacyOutputs([...wipeIds].map((id) => byId.get(id) ?? task));
  await prisma.$transaction(
    [...wipeIds].map((id) => {
      const item = byId.get(id) ?? task;
      const keepNote = id === task.id || rootIds.has(id);
      return prisma.task.update({
        where: { id },
        data: {
          status: "pending",
          output: null,
          startedAt: null,
          completedAt: null,
          model: null,
          ...(keepNote ? { instructions: appendChangeNote(item.instructions, trimmed) } : {}),
        },
      });
    }),
  );

  const rootTitles = roots.map((item) => item.title).join(", ");
  await emit(
    task.projectId,
    "note",
    `You requested changes on "${task.title}": ${trimmed}. Run "${rootTitles}" again. Nothing was sent to the models.`,
    task.id,
    {
      fromTaskId: task.id,
      toTaskId: roots.length === 1 ? roots[0].id : null,
      payload: {
        decision: "changes_requested",
        approver: "You",
        note: trimmed,
        rootTaskIds: roots.map((item) => item.id),
        clearedTaskIds: [...wipeIds],
      },
    },
  );
  const agentIds = [...new Set([...wipeIds].map((id) => (byId.get(id) ?? task).agentId))];
  for (const agentId of agentIds) await syncAgentStatus(agentId);
  return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
}
