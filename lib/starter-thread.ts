import { DAEDALUS, ODYSSEUS } from "@/lib/hands";
import { prisma } from "@/lib/prisma";

type TaskSpec = {
  key: string;
  agent: "Odysseus" | "Daedalus" | "You";
  title: string;
  instructions: string;
  dependsOn: string[];
  requiresApproval: boolean;
};

// The starting thread for a project the user names. It carries no content of its
// own: every step works from the brief the user wrote. (The old example projects
// and "Reset demo" are gone; nothing here seeds fake data.)
//
// Roles (fixed by the founder, Oct 6 2026): Odysseus (Claude) is the Drafter;
// Daedalus (GPT) is the Challenger; You judge. Marketing sells four stages —
// Draft → Challenge → Judge → Tie Off — so new projects use four steps (research
// is folded into Draft; the final writeup is the Tie Off artifact). Existing
// projects keep whatever steps they already have; this list only seeds new ones.
const OWN_TASKS: TaskSpec[] = [
  {
    key: "draft",
    agent: "Odysseus",
    title: "Draft the answer",
    instructions:
      "Read the shared context. Settle what the brief asks for: the goals, the constraints, and the questions the answer has to settle. Note what you already know that bears on them, and where you are unsure.\n\nThen write what the brief asks for. Lead with the answer. Supporting points next, with a source or your reasoning for each, and say plainly where you are unsure. You cannot search the web here — work from the brief and what you already know.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Daedalus",
    title: "Challenge the draft",
    instructions:
      "Try to prove the draft wrong. Do not write your own answer.\n\nFor each problem, write a numbered dispute in exactly this shape (one blank line between disputes):\n\n1. Claim: <the specific claim from the draft>\n   Objection: <incorrect, unsupported, outdated, contradicted, a weak source, missing, or misleading — and why>\n   Evidence: <a quote or citation that appears in the draft> OR Opinion: <why you doubt it from your own knowledge — you cannot search the web>\n   Confidence: high | medium | low\n   Fix: <suggested fix>\n\nPrefer fewer precise disputes over a long essay. Do not open with a Verdict. If you find nothing material, say so in one short paragraph and list no disputes.",
    dependsOn: ["draft"],
    requiresApproval: false,
  },
  {
    key: "approve",
    agent: "You",
    title: "Judge the draft",
    instructions:
      "Read the draft and the challenge. Tie it off, or ask for changes: add the challenges you agree with to your note, and Odysseus revises.",
    dependsOn: ["review"],
    requiresApproval: true,
  },
  {
    key: "build",
    agent: "Odysseus",
    title: "Write the tied-off answer",
    instructions:
      "Write the tied-off answer from the draft the human approved. Keep its claims and conclusions as approved; do not add new claims.\n\nUse these headings, in this order:\n\n## Answer\nLead with the answer.\n\n## Sources\nThe sources or reasoning that support it. Say when something rests on the draft alone.\n\n## Disagreements\nChallenges that stayed open or that the human did not take. Write \"None.\" if there are none.\n\n## Attention required\nWhat the reader should still verify or watch. Write \"None.\" if there is nothing.",
    dependsOn: ["approve"],
    requiresApproval: false,
  },
];

function modelFor(provider: "anthropic" | "openai" | "human"): string {
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() || "unset";
  if (provider === "openai") return process.env.OPENAI_MODEL?.trim() || "unset";
  return "human";
}

export async function createRoster(projectId: string) {
  const odysseus = await prisma.agent.create({
    data: {
      projectId,
      name: ODYSSEUS,
      provider: "anthropic",
      model: modelFor("anthropic"),
      role: "The Drafter. Settles the brief, writes the answer and revises it.",
      status: "idle",
    },
  });
  const daedalus = await prisma.agent.create({
    data: {
      projectId,
      name: DAEDALUS,
      provider: "openai",
      model: modelFor("openai"),
      role: "The Challenger. Checks the draft against the same goal: what is incorrect, unsupported, outdated, contradicted or missing. Reviews the work, never writes an answer of its own.",
      status: "idle",
    },
  });
  const you = await prisma.agent.create({
    data: {
      projectId,
      name: "You",
      provider: "human",
      model: modelFor("human"),
      role: "The judge. Nothing is final until you tie it off.",
      status: "idle",
    },
  });
  return { Odysseus: odysseus, Daedalus: daedalus, You: you };
}

export async function createStarterTasks(
  projectId: string,
  agents: Awaited<ReturnType<typeof createRoster>>,
  tasks: TaskSpec[] = OWN_TASKS,
) {
  const ids = new Map<string, string>();
  const createdAtBase = Date.now();

  for (const [index, spec] of tasks.entries()) {
    const task = await prisma.task.create({
      data: {
        projectId,
        agentId: agents[spec.agent].id,
        title: spec.title,
        instructions: spec.instructions,
        status: "pending",
        dependsOn: JSON.stringify(
          spec.dependsOn.map((key) => {
            const dependencyId = ids.get(key);
            if (!dependencyId) throw new Error(`Missing starter dependency ${key}`);
            return dependencyId;
          }),
        ),
        requiresApproval: spec.requiresApproval,
        createdAt: new Date(createdAtBase + index),
      },
    });
    ids.set(spec.key, task.id);
  }
}

async function seedOwnBoard(projectId: string) {
  const agents = await createRoster(projectId);
  await createStarterTasks(projectId, agents, OWN_TASKS);
}


export async function createUserProject(userId: string, name: string, brief: string) {
  const project = await prisma.project.create({
    data: { userId, name, brief, template: "own" },
  });
  await seedOwnBoard(project.id);
  return project.id;
}

/**
 * Should the user see "What are you making?" first? Answered from the project list the
 * page has already loaded (every project of this user, with template and brief), so the
 * board load needs no extra queries in the usual case. A named own project means no
 * intro; no projects means intro; otherwise intro until any task has started.
 */
export async function needsProjectIntroFor(
  userId: string,
  projects: readonly { template: string; brief: string }[],
) {
  if (projects.some((project) => project.template === "own" && project.brief !== "")) return false;
  if (projects.length === 0) return true;
  const started = await prisma.task.findFirst({
    where: { status: { not: "pending" }, project: { userId } },
    select: { id: true },
  });
  return !started;
}

export async function startFirstProject(userId: string, name: string, brief: string) {
  const own = await prisma.project.findFirst({
    where: { userId, template: "own" },
    orderBy: { createdAt: "asc" },
  });
  let projectId: string;
  if (own && own.brief.trim().length === 0) {
    await prisma.project.update({ where: { id: own.id }, data: { name, brief } });
    const agents = await prisma.agent.count({ where: { projectId: own.id } });
    if (agents === 0) await seedOwnBoard(own.id);
    projectId = own.id;
  } else if (!own) {
    projectId = await createUserProject(userId, name, brief);
  } else {
    projectId = own.id;
  }

  const started = await prisma.task.findFirst({
    where: { status: { not: "pending" }, project: { userId, template: { in: ["landing", "market"] } } },
    select: { id: true },
  });
  if (!started) {
    await prisma.project.deleteMany({
      where: { userId, template: { in: ["landing", "market"] } },
    });
  }
  return projectId;
}
