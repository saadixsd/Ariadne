import "server-only";

import { parseCritique } from "@/lib/critique";
import { TaskRunError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import { buildKnots, type ThreadData } from "@/lib/knots";
import { documentOf, issueKey, threadSteps } from "@/lib/workspace";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Small rows only: run metadata, Challenge outputs (to count issues) and decisions. */
export async function loadThread(projectId: string, userId: string): Promise<ThreadData | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true, approvedAt: true } });
  if (!project) return null;
  const [runs, challengeOutputs, decisions] = await Promise.all([
    prisma.taskRun.findMany({
      where: { projectId },
      select: { id: true, taskId: true, attempt: true, outcome: true, model: true, error: true, completedAt: true, createdAt: true },
    }),
    prisma.taskRun.findMany({ where: { projectId, provider: "openai", outcome: "succeeded" }, select: { id: true, output: true } }),
    prisma.issueDecision.findMany({ where: { projectId }, select: { flagKey: true, state: true, edit: true, updatedAt: true } }),
  ]);
  const outputs = new Map(challengeOutputs.map((r) => [r.id, r.output]));
  return {
    runs: runs.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      attempt: r.attempt,
      outcome: r.outcome,
      model: r.model,
      error: r.error ? r.error.slice(0, 200) : null,
      completedAt: iso(r.completedAt),
      createdAt: r.createdAt.toISOString(),
      output: outputs.get(r.id) ?? null,
    })),
    decisions: decisions.map((d) => ({ flagKey: d.flagKey, state: d.state, edit: d.edit, updatedAt: d.updatedAt.toISOString() })),
    approvedAt: iso(project.approvedAt),
  };
}

/** The tied-off thread as Markdown: goal, sources, final answer, every issue and your decision, and the thread. */
export async function exportRecord(projectId: string, userId: string): Promise<{ name: string; markdown: string }> {
  const project = await getProject(projectId, userId);
  if (!project) throw new TaskRunError("Project not found", 404);
  const [meta, sources, data] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { approvedAt: true } }),
    prisma.sourceFile.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    loadThread(projectId, userId),
  ]);
  if (!meta?.approvedAt || !data) throw new TaskRunError("Approve the deliverable first; the record is the approved thread.", 409);
  const steps = threadSteps(project);
  const doc = documentOf(steps);
  const decisions = new Map(data.decisions.map((d) => [d.flagKey, d]));
  const knots = buildKnots(data, steps);
  const out: string[] = [];
  out.push(`# ${project.name}`, "", `Thread record exported from Ariadne. Approved ${meta.approvedAt.toISOString()}.`, "");
  out.push("## Brief", "", project.brief.trim() || "(none)", "");
  out.push("## Sources", "", ...(sources.length ? sources.map((s) => `- ${s.name}`) : ["- (none)"]), "");
  out.push("## Approved answer", "", doc.text ?? "(none)", "");
  out.push("## Issues and decisions", "");
  let round = 0;
  for (const run of data.runs.filter((r) => r.output).sort((a, b) => (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt))) {
    round++;
    const flags = parseCritique(run.output).flags;
    out.push(`### Challenge round ${round}`, "");
    if (!flags.length) out.push("No issues raised.", "");
    for (const f of flags) {
      const d = decisions.get(issueKey(f));
      out.push(`- **${f.confidence ?? "unrated"}** ${f.claim ? `“${f.claim}”: ` : ""}${f.issue}`);
      out.push(`  - Decision: ${d ? d.state : "not decided"}${d?.edit ? ` (correction: ${d.edit})` : ""}`);
    }
    out.push("");
  }
  out.push("## Thread", "", ...knots.map((k) => `- ${k.at ?? ""} · ${k.step}${k.version ? ` v${k.version}` : ""} · ${k.actor} · ${k.summary}`), "");
  out.push("Approval is your sign-off. Ariadne does not guarantee the answer is correct.", "");
  return { name: project.name, markdown: out.join("\n") };
}
