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
// Daedalus (GPT) is the Challenger (the fact-checker); You judge. Marketing sells four stages —
// Draft → Challenge → Judge → Tie Off — so new projects use four steps (research
// is folded into Draft; the final writeup is the Tie Off artifact). Existing
// projects keep whatever steps they already have; this list only seeds new ones.
const OWN_TASKS: TaskSpec[] = [
  {
    key: "draft",
    agent: "Odysseus",
    title: "Draft the answer",
    instructions:
      "Read the shared context. Settle what the brief asks: the exact question, the constraints, and what a correct answer has to show.\n\nThen answer it directly. Use web search to look up current facts. Lead with the direct answer. State each fact as a specific, checkable claim (numbers, dates, names), and cite its source inline, next to the claim, as a Markdown link to the page you used (or the shared file name). When you are not sure of a fact, say so plainly and why. Never refuse because you lack access to something: give your best sourced answer and mark what is uncertain. Another model will fact-check every claim.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    key: "review",
    agent: "Daedalus",
    title: "Fact-check the draft",
    instructions:
      "Fact-check the draft claim by claim, working toward the same goal as the brief. Do not write your own answer.\n\nList every factual claim in the draft (numbers, dates, names, causal statements, citations). Check each one against the shared sources and, when web search is available, against current authoritative sources on the web. Prefer primary sources (official registries, the operator's own site, papers) over summaries.\n\nStart with one line: Data checked: <the as-of date or timestamp the source shows, or today's date>. Use that one date for the whole check.\n\nWrite each claim in exactly this shape (one blank line between claims):\n\n1. Claim: \"<the claim, quoted from the draft>\"\n   Verdict: supported | unsupported | wrong\n   Evidence: <the exact words from the source, in double quotes, then any short note>\n   Source: <the URL you checked, or the shared file name; none if you found nothing>\n   Severity: high | medium | low  (how much the claim matters to the answer)\n   Fix: <the corrected claim, for wrong or unsupported claims>\n\nsupported = a source you checked says the same, and you quote its exact words; if you cannot quote it, the claim is unsupported. wrong = a source you checked says otherwise. unsupported = you could not find a source either way. Never mark a claim supported or wrong without a source. If you cannot search the web, say so in one line first and mark claims you cannot check against the shared sources as unsupported.",
    dependsOn: ["draft"],
    requiresApproval: false,
  },
  {
    key: "approve",
    agent: "You",
    title: "Judge the flagged claims",
    instructions:
      "Read the draft and the fact-check. Decide on each flagged claim, then tie it off, or ask Odysseus to revise with your decisions.",
    dependsOn: ["review"],
    requiresApproval: true,
  },
  {
    key: "build",
    agent: "Odysseus",
    title: "Write the tied-off answer",
    instructions:
      "Write the tied-off answer from the draft the human approved, applying the human's decisions on the fact-checked claims. Do not add new claims.\n\nUse these headings, in this order:\n\n## Answer\nLead with the answer.\n\n## Sources\nThe sources behind each key claim, with links where the fact-check gave them.\n\n## Open points\nClaims that stayed unsupported or that the human left undecided. Write \"None.\" if there are none.",
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
      role: "The fact-checker. Checks each claim in the draft against the sources and the web, toward the same goal, and labels it supported, unsupported or wrong. Never writes an answer of its own.",
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
