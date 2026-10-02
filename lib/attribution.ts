/*
  Who made an artifact and who reviewed it, read from the project's own agents and
  task graph. "Reviewed by" is only ever claimed for a review step that exists, that
  takes this step's output, and that has been spun on the current version (a rerun
  of the work resets its review, so a spun review always read what is shown).
*/
import { handName } from "@/lib/hands";
import type { AgentDTO, ProjectDTO, TaskDTO } from "@/lib/types";

export type HandLabel = { name: string; family: string | null; human: boolean };

export type Attribution = {
  madeBy: HandLabel | null;
  /** A spun review step that read this output. */
  reviewedBy: HandLabel | null;
  /** A review step exists downstream but has not been spun on this version yet. */
  reviewPending: HandLabel | null;
  /** For a review step: whose work it critiques. */
  reviews: HandLabel | null;
  /** A knot downstream that you tied off. */
  tiedOff: boolean;
};

const REVIEW_TITLE = /^(review|critique|check|audit|proofread|assess|evaluate)\b/i;
const REVIEW_INSTRUCTIONS = /^(review|critique|check|audit|proofread|assess|evaluate)\b/i;

function family(agent: AgentDTO): string | null {
  if (agent.provider === "anthropic") return "Claude";
  if (agent.provider === "openai") return "GPT";
  return null;
}

export function handLabel(agent: AgentDTO | undefined): HandLabel | null {
  if (!agent) return null;
  const human = agent.provider === "human";
  return { name: human ? "You" : handName(agent.name), family: family(agent), human };
}

/** "GPT · Daedalus", or "You". */
export function handText(hand: HandLabel): string {
  return hand.family ? `${hand.family} · ${hand.name}` : hand.name;
}

function agentFor(task: TaskDTO, agents: AgentDTO[]) {
  return agents.find((agent) => agent.id === task.agentId);
}

/** A model step whose job is to critique what it is handed. */
export function isReviewStep(task: TaskDTO, agents: AgentDTO[]): boolean {
  const agent = agentFor(task, agents);
  if (!agent || agent.provider === "human") return false;
  return REVIEW_TITLE.test(task.title.trim()) || REVIEW_INSTRUCTIONS.test(task.instructions.trim());
}

/** The review step that reads this task's output directly, if the thread has one. */
export function reviewStepFor(task: TaskDTO, project: Pick<ProjectDTO, "tasks" | "agents">): TaskDTO | null {
  if (isReviewStep(task, project.agents)) return null;
  const made = agentFor(task, project.agents);
  if (!made || made.provider === "human") return null;
  return project.tasks.find((item) => item.dependsOn.includes(task.id) && isReviewStep(item, project.agents)) ?? null;
}

function downstreamGateTiedOff(task: TaskDTO, project: Pick<ProjectDTO, "tasks" | "agents">): boolean {
  const seen = new Set<string>([task.id]);
  const queue = [task.id];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const item of project.tasks) {
      if (seen.has(item.id) || !item.dependsOn.includes(id)) continue;
      seen.add(item.id);
      const agent = agentFor(item, project.agents);
      if (agent?.provider === "human") {
        if (item.status === "done") return true;
        continue; // a knot is as far as a decision reaches
      }
      queue.push(item.id);
    }
  }
  return false;
}

export function attributionFor(task: TaskDTO, project: Pick<ProjectDTO, "tasks" | "agents">): Attribution {
  const agent = agentFor(task, project.agents);
  const madeBy = handLabel(agent);
  const empty: Attribution = { madeBy, reviewedBy: null, reviewPending: null, reviews: null, tiedOff: false };
  if (!agent || agent.provider === "human") return empty;

  if (isReviewStep(task, project.agents)) {
    const source = task.dependsOn
      .map((id) => project.tasks.find((item) => item.id === id))
      .find((item) => item && agentFor(item, project.agents)?.provider !== "human");
    return { ...empty, reviews: source ? handLabel(agentFor(source, project.agents)) : null, tiedOff: downstreamGateTiedOff(task, project) };
  }

  const review = reviewStepFor(task, project);
  const reviewer = review ? handLabel(agentFor(review, project.agents)) : null;
  const spun = review?.status === "done";
  return {
    ...empty,
    reviewedBy: spun ? reviewer : null,
    reviewPending: review && !spun ? reviewer : null,
    tiedOff: downstreamGateTiedOff(task, project),
  };
}

/** "Made by GPT · Daedalus — Reviewed by Claude · Odysseus" (plain text, for labels and tests). */
export function attributionLine(attribution: Attribution): string | null {
  const { madeBy } = attribution;
  if (!madeBy) return null;
  if (madeBy.human) return "Judged by You";
  const parts = [`Made by ${handText(madeBy)}`];
  if (attribution.reviews) parts.push(`Reviewing ${handText(attribution.reviews)}`);
  else if (attribution.reviewedBy) parts.push(`Reviewed by ${handText(attribution.reviewedBy)}`);
  else if (attribution.reviewPending) parts.push(`Review by ${handText(attribution.reviewPending)} not spun yet`);
  let line = parts.join(" — ");
  if (attribution.tiedOff) line += " · tied off by You";
  return line;
}
