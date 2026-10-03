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
const OWN_TASKS: TaskSpec[] = [
  {
    key: "research",
    agent: "Odysseus",
    title: "Research the brief",
    instructions:
      "Read the shared context. List the goals, constraints, and the questions that have to be answered before anyone builds.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "draft",
    agent: "Daedalus",
    title: "Draft from the brief",
    instructions: "Using the shared context and the research, draft the work the brief asks for.",
    dependsOn: ["research"],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Odysseus",
    title: "Review the draft",
    instructions: "Critique the draft against the shared context. Flag anything off-brief and suggest fixes.",
    dependsOn: ["draft"],
    requiresApproval: false,
  },
  {
    key: "approve",
    agent: "You",
    title: "Approve the direction",
    instructions: "Read the draft and the review. Approve it, or request changes.",
    dependsOn: ["review"],
    requiresApproval: true,
  },
  {
    key: "build",
    agent: "Daedalus",
    title: "Produce the work",
    instructions: "Produce the artifact the shared context asks for, using the approved direction.",
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
      role: "Researcher + reviewer. Reads context, investigates, critiques.",
      status: "idle",
    },
  });
  const daedalus = await prisma.agent.create({
    data: {
      projectId,
      name: DAEDALUS,
      provider: "openai",
      model: modelFor("openai"),
      role: "Builder + writer. Drafts, generates, produces artifacts.",
      status: "idle",
    },
  });
  const you = await prisma.agent.create({
    data: {
      projectId,
      name: "You",
      provider: "human",
      model: modelFor("human"),
      role: "Human director and approver. Nothing ships without you.",
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

