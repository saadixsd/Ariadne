import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const DEMO_NAME = "Launch landing page";

export const DEMO_BRIEF =
  "Ariadne coordinates the AI agents a team already uses. The human directs and approves. Scout researches and reviews. Maker drafts and builds. Produce work a team could put on a public landing page.";

export const MARKET_NAME = "Ariadne market research";

export const MARKET_BRIEF =
  "Ariadne is a coordination layer for people who already use Claude and GPT. The question is whether a team will pay to stop copy-pasting context between those agents. Research that market. The human approves before a product plan is written.";

type TaskSpec = {
  key: string;
  agent: "Scout" | "Maker" | "You";
  title: string;
  instructions: string;
  dependsOn: string[];
  requiresApproval: boolean;
};

const LANDING_TASKS: TaskSpec[] = [
  {
    key: "research",
    agent: "Scout",
    title: "Research positioning",
    instructions:
      "Research how 3 competitors position themselves. Output 5 distinct positioning angles for our product, each one sentence.",
    dependsOn: [] as string[],
    requiresApproval: false,
  },
  {
    key: "draft",
    agent: "Maker",
    title: "Draft landing page copy",
    instructions:
      "Write landing page copy (hero, 3 features, CTA) based on the positioning angles.",
    dependsOn: ["research"],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Scout",
    title: "Review the copy",
    instructions:
      "Critique this copy against the positioning angles. Flag anything off-message; suggest fixes.",
    dependsOn: ["draft"],
    requiresApproval: false,
  },
  {
    key: "approve",
    agent: "You",
    title: "Approve the copy",
    instructions: "Read the draft and the review. Approve the copy, or request changes.",
    dependsOn: ["review"],
    requiresApproval: true,
  },
  {
    key: "build",
    agent: "Maker",
    title: "Build the landing page",
    instructions: "Generate a single-file HTML landing page using the approved copy.",
    dependsOn: ["approve"],
    requiresApproval: false,
  },
];

const MARKET_TASKS: TaskSpec[] = [
  {
    key: "research",
    agent: "Scout",
    title: "Research the market",
    instructions:
      "Research the market for tools that coordinate multiple AI agents for a small team. Name 5 existing products or approaches, who they serve, and the gap a coordination layer could fill. One short paragraph per point.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "opportunities",
    agent: "Maker",
    title: "Synthesize opportunities",
    instructions:
      "Turn that research into 3 concrete opportunities for Ariadne. For each: who hurts, what they do manually today, and why a handoff-and-approval workspace would be worth paying for.",
    dependsOn: ["research"],
    requiresApproval: false,
  },
  {
    key: "critique",
    agent: "Scout",
    title: "Critique weak assumptions",
    instructions:
      "Critique the opportunities. Flag weak assumptions, missing competitors, and anything that is not evidence. Say which opportunity is the strongest and why.",
    dependsOn: ["opportunities"],
    requiresApproval: false,
  },
  {
    key: "approve",
    agent: "You",
    title: "Approve the direction",
    instructions: "Read the opportunities and the critique. Approve a direction, or request changes.",
    dependsOn: ["critique"],
    requiresApproval: true,
  },
  {
    key: "plan",
    agent: "Maker",
    title: "Write the product plan",
    instructions:
      "Write a one-page product plan for the approved direction: who it is for, the workflow, what this version includes, and what it refuses to build.",
    dependsOn: ["approve"],
    requiresApproval: false,
  },
];

const OWN_TASKS: TaskSpec[] = [
  {
    key: "research",
    agent: "Scout",
    title: "Research the brief",
    instructions:
      "Read the shared context. List the goals, constraints, and the questions that have to be answered before anyone builds.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "draft",
    agent: "Maker",
    title: "Draft from the brief",
    instructions: "Using the shared context and the research, draft the work the brief asks for.",
    dependsOn: ["research"],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Scout",
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
    agent: "Maker",
    title: "Produce the work",
    instructions: "Produce the artifact the shared context asks for, using the approved direction.",
    dependsOn: ["approve"],
    requiresApproval: false,
  },
];

const TEMPLATES = {
  landing: { name: DEMO_NAME, brief: DEMO_BRIEF, tasks: LANDING_TASKS },
  market: { name: MARKET_NAME, brief: MARKET_BRIEF, tasks: MARKET_TASKS },
} as const;

type TemplateKey = keyof typeof TEMPLATES;

function modelFor(provider: "anthropic" | "openai" | "human"): string {
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() || "unset";
  if (provider === "openai") return process.env.OPENAI_MODEL?.trim() || "unset";
  return "human";
}

export async function createRoster(projectId: string) {
  const scout = await prisma.agent.create({
    data: {
      projectId,
      name: "Scout",
      provider: "anthropic",
      model: modelFor("anthropic"),
      role: "Researcher + reviewer. Reads context, investigates, critiques.",
      status: "idle",
    },
  });
  const maker = await prisma.agent.create({
    data: {
      projectId,
      name: "Maker",
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
  return { Scout: scout, Maker: maker, You: you };
}

export async function createDemoTasks(
  projectId: string,
  agents: Awaited<ReturnType<typeof createRoster>>,
  tasks: TaskSpec[] = LANDING_TASKS,
) {
  const ids = new Map<string, string>();
  const createdAtBase = new Date("2026-01-01T00:00:00.000Z").getTime();

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
            if (!dependencyId) throw new Error(`Missing demo dependency ${key}`);
            return dependencyId;
          }),
        ),
        requiresApproval: spec.requiresApproval,
        createdAt: new Date(createdAtBase + index * 1000),
      },
    });
    ids.set(spec.key, task.id);
  }
}

async function seedOwnBoard(projectId: string) {
  const agents = await createRoster(projectId);
  await createDemoTasks(projectId, agents, OWN_TASKS);
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const OWN_PROJECT_NAME = "My project";

export async function createUserProject(userId: string, name: string, brief: string) {
  const project = await prisma.project.create({
    data: { userId, name, brief, template: "own" },
  });
  await seedOwnBoard(project.id);
  return project.id;
}

export async function needsProjectIntro(userId: string) {
  const projects = await prisma.project.findMany({
    where: { userId },
    select: {
      template: true,
      brief: true,
      tasks: { select: { status: true } },
      _count: { select: { events: true } },
    },
  });
  if (projects.length === 0) return true;
  const used = projects.some(
    (project) => project._count.events > 0 || project.tasks.some((task) => task.status !== "pending"),
  );
  if (used) return false;
  return !projects.some((project) => project.template === "own" && project.brief.trim().length > 0);
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

  const examples = await prisma.project.findMany({
    where: { userId, template: { in: ["landing", "market"] } },
    select: {
      id: true,
      tasks: { select: { status: true } },
      _count: { select: { events: true } },
    },
  });
  const removable = examples
    .filter(
      (project) => project._count.events === 0 && project.tasks.every((task) => task.status === "pending"),
    )
    .map((project) => project.id);
  if (removable.length > 0) {
    await prisma.project.deleteMany({ where: { id: { in: removable } } });
  }
  return projectId;
}

export async function ensureOwnProject(userId: string) {
  const existing = await prisma.project.findFirst({
    where: { userId, template: "own" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const agents = await prisma.agent.count({ where: { projectId: existing.id } });
    if (agents === 0) await seedOwnBoard(existing.id);
    return existing.id;
  }

  const id = `own_${userId}`;
  try {
    await prisma.project.create({
      data: { id, userId, name: OWN_PROJECT_NAME, brief: "", template: "own" },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const raced = await prisma.project.findFirst({
      where: { userId, template: "own" },
      orderBy: { createdAt: "asc" },
    });
    if (!raced) throw error;
    const agents = await prisma.agent.count({ where: { projectId: raced.id } });
    if (agents === 0) await seedOwnBoard(raced.id);
    return raced.id;
  }

  await seedOwnBoard(id);
  return id;
}

async function createFromTemplate(template: TemplateKey, userId: string) {
  const spec = TEMPLATES[template];
  const project = await prisma.project.create({
    data: { userId, name: spec.name, brief: spec.brief, template },
  });
  const agents = await createRoster(project.id);
  await createDemoTasks(project.id, agents, spec.tasks);
  return project.id;
}

export async function createDemoProject(userId: string) {
  return createFromTemplate("landing", userId);
}

export async function resetDemo(projectId: string) {
  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (existing?.template === "own") {
    await prisma.$transaction([
      prisma.activityEvent.deleteMany({ where: { projectId } }),
      prisma.task.deleteMany({ where: { projectId } }),
      prisma.agent.deleteMany({ where: { projectId } }),
    ]);
    await seedOwnBoard(projectId);
    return projectId;
  }
  const template: TemplateKey = existing?.template === "market" ? "market" : "landing";
  const spec = TEMPLATES[template];
  await prisma.$transaction([
    prisma.activityEvent.deleteMany({ where: { projectId } }),
    prisma.task.deleteMany({ where: { projectId } }),
    prisma.agent.deleteMany({ where: { projectId } }),
  ]);
  await prisma.project.update({
    where: { id: projectId },
    data: { name: spec.name, brief: spec.brief, template },
  });
  const agents = await createRoster(projectId);
  await createDemoTasks(projectId, agents, spec.tasks);
  return projectId;
}

export async function ensureDemo(userId: string, options?: { reset?: boolean }) {
  const existing = await prisma.project.findFirst({
    where: { template: "landing", userId },
    orderBy: { createdAt: "asc" },
  });
  if (!existing) return createFromTemplate("landing", userId);
  if (options?.reset) return resetDemo(existing.id);
  return existing.id;
}

export async function ensureMarketProject(userId: string) {
  const existing = await prisma.project.findFirst({
    where: { template: "market", userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;
  return createFromTemplate("market", userId);
}
