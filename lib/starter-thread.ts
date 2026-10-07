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
// Roles (fixed by the founder, Oct 6 2026): Odysseus (Claude) is the Drafter: he
// researches, drafts and writes the final version. Daedalus (GPT) is the Challenger:
// he attacks the draft he is handed and never writes an answer of his own. You judge.
// Same five steps and the same number of model calls as before; only who runs each
// model step changed (it was Daedalus drafting and Odysseus reviewing).
const OWN_TASKS: TaskSpec[] = [
  {
    key: "research",
    agent: "Odysseus",
    title: "Research the brief",
    instructions:
      "Read the shared context. List the goals, the constraints, and the questions the answer has to settle. Note what you already know that bears on them, and where you are unsure.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "draft",
    agent: "Odysseus",
    title: "Draft the answer",
    instructions:
      "Using the shared context and the research, write what the brief asks for. Lead with the answer. Then give the supporting points, with a source or your reasoning for each, and say plainly where you are unsure.",
    dependsOn: ["research"],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Daedalus",
    title: "Challenge the draft",
    instructions:
      "Try to prove the draft wrong. Do not write your own answer. Start with a one-line Verdict. Then list each problem as a numbered item: the claim, what is wrong with it (incorrect, unsupported, outdated, contradicted, a weak source, missing, or misleading), and a suggested fix. You cannot search the web here, so say when a point rests on your own knowledge rather than on a source in the draft.",
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
    title: "Write the final version",
    instructions:
      "Write the final version of the draft the human approved. Lead with the answer. Keep its claims and conclusions as approved; do not add new claims.",
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
      role: "The Drafter. Researches the brief, writes the answer and revises it.",
      status: "idle",
    },
  });
  const daedalus = await prisma.agent.create({
    data: {
      projectId,
      name: DAEDALUS,
      provider: "openai",
      model: modelFor("openai"),
      role: "The Challenger. Tries to prove the draft wrong: what is incorrect, unsupported, outdated, contradicted or missing. Critiques the work, never writes an answer of its own.",
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

