import "server-only";

import { TaskRunError } from "@/lib/errors";
import { shouldPromptFeedback } from "@/lib/feedback";
import { getFileStore, MAX_ORIGINAL_BYTES, originalExpiry, originalKey, userPrefix } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { closeWorkflow } from "@/lib/usage";
import { getProject } from "@/lib/project";
import { parseSources, sourceDigest, type SourceInput } from "@/lib/sources";
import type { ProjectDTO } from "@/lib/types";
import { documentOf, hashText, ISSUE_STATES, threadSteps, type Decision, type IssueState } from "@/lib/workspace";

export type SourceSummary = { id: string; name: string; bytes: number | null; words: number; opening: string; createdAt: string; originalUntil: string | null };

export type WorkspaceData = {
  project: ProjectDTO;
  decisions: Decision[];
  sources: SourceSummary[];
  approvedAt: string | null;
  approvedHash: string | null;
  promptFeedback: boolean;
};

export async function loadWorkspace(projectId: string, userId: string): Promise<WorkspaceData | null> {
  const project = await getProject(projectId, userId);
  if (!project) return null;
  const [meta, decisions, sources, user] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { approvedAt: true, approvedHash: true } }),
    prisma.issueDecision.findMany({ where: { projectId } }),
    prisma.sourceFile.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { feedbackPromptAt: true } }),
  ]);
  return {
    project,
    decisions: decisions.map((d) => ({ flagKey: d.flagKey, state: d.state as IssueState, edit: d.edit, reason: d.reason })),
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      bytes: s.bytes,
      createdAt: s.createdAt.toISOString(),
      originalUntil: s.blobKey && s.expiresAt && s.expiresAt.getTime() > Date.now() ? s.expiresAt.toISOString() : null,
      ...sourceDigest(s.text),
    })),
    approvedAt: meta?.approvedAt?.toISOString() ?? null,
    approvedHash: meta?.approvedHash ?? null,
    promptFeedback: user ? shouldPromptFeedback(user, meta?.approvedAt ?? null) : false,
  };
}

async function ownedProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new TaskRunError("Project not found", 404);
  return project;
}

export async function decideIssue(
  projectId: string,
  userId: string,
  input: { flagKey?: unknown; taskId?: unknown; state?: unknown; edit?: unknown; reason?: unknown },
) {
  await ownedProject(projectId, userId);
  const flagKey = typeof input.flagKey === "string" && /^i[0-9a-f]{8}$/.test(input.flagKey) ? input.flagKey : null;
  const taskId = typeof input.taskId === "string" ? input.taskId : null;
  const state = typeof input.state === "string" && (ISSUE_STATES as readonly string[]).includes(input.state) ? (input.state as IssueState) : null;
  if (!flagKey || !taskId || !state) throw new TaskRunError("Expected flagKey, taskId and state", 400);
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
  if (!task) throw new TaskRunError("Task not found", 404);
  const edit = typeof input.edit === "string" ? input.edit.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (edit.length > 2000 || reason.length > 1000) throw new TaskRunError("Text is too long", 400);
  if (state === "edited" && !edit) throw new TaskRunError("Write your correction first", 400);
  if (state === "open") {
    await prisma.issueDecision.deleteMany({ where: { projectId, flagKey } });
    return { flagKey, state, edit: null, reason: null };
  }
  const data = { taskId, state, edit: state === "edited" ? edit : null, reason: reason || null, updatedAt: new Date() };
  const row = await prisma.issueDecision.upsert({
    where: { projectId_flagKey: { projectId, flagKey } },
    create: { projectId, flagKey, ...data },
    update: data,
  });
  return { flagKey: row.flagKey, state: row.state as IssueState, edit: row.edit, reason: row.reason };
}

/** Explicit final approval of the tied-off answer exactly as shown (hash must match). */
export async function approveDeliverable(projectId: string, userId: string, hash: unknown) {
  const project = await getProject(projectId, userId);
  if (!project) throw new TaskRunError("Project not found", 404);
  const steps = threadSteps(project);
  const doc = documentOf(steps);
  if (doc.from !== "tieOff" || !doc.text) {
    throw new TaskRunError("Tie off first: approve the draft at Judge, then write the tied-off answer.", 409);
  }
  const current = hashText(doc.text);
  if (hash !== current) throw new TaskRunError("The deliverable changed since you opened it. Reload and approve again.", 409);
  const approvedAt = new Date();
  await prisma.project.update({ where: { id: projectId }, data: { approvedAt, approvedHash: current } });
  await closeWorkflow(projectId);
  await prisma.activityEvent.create({
    data: { projectId, type: "approved", message: "You approved the deliverable", taskId: steps.tieOff?.id ?? null, payload: JSON.stringify({ kind: "deliverable_approved", hash: current }) },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { feedbackPromptAt: true } });
  return { approvedAt: approvedAt.toISOString(), approvedHash: current, promptFeedback: user ? shouldPromptFeedback(user, approvedAt) : false };
}

export async function addSources(projectId: string, userId: string, raw: unknown) {
  await ownedProject(projectId, userId);
  const existing = await prisma.sourceFile.findMany({ where: { projectId }, select: { text: true } });
  let sources: SourceInput[];
  try {
    sources = parseSources(raw, existing.reduce((n, s) => n + s.text.length, 0), existing.length);
  } catch (error) {
    throw new TaskRunError((error as Error).message, 400);
  }
  const created: { id: string; name: string }[] = [];
  for (const s of sources) {
    const row = await prisma.sourceFile.create({ data: { projectId, ...s }, select: { id: true, name: true } });
    created.push(row);
  }
  return created;
}

/** Keep the original bytes of one source in R2 for 3 days. Returns null when storage is off. */
export async function storeOriginal(projectId: string, userId: string, sourceId: string, body: ArrayBuffer, contentType: string | null) {
  await ownedProject(projectId, userId);
  const source = await prisma.sourceFile.findFirst({ where: { id: sourceId, projectId }, select: { id: true } });
  if (!source) throw new TaskRunError("File not found", 404);
  if (body.byteLength === 0) throw new TaskRunError("Empty file", 400);
  if (body.byteLength > MAX_ORIGINAL_BYTES) throw new TaskRunError("Files up to 15 MB", 413);
  const store = await getFileStore();
  if (!store) return null;
  const key = originalKey(userId, projectId, sourceId);
  await store.put(key, body, contentType);
  const expiresAt = originalExpiry();
  await prisma.sourceFile.update({ where: { id: sourceId }, data: { blobKey: key, expiresAt } });
  return { expiresAt: expiresAt.toISOString() };
}

export async function readOriginal(projectId: string, userId: string, sourceId: string) {
  await ownedProject(projectId, userId);
  const source = await prisma.sourceFile.findFirst({ where: { id: sourceId, projectId } });
  if (!source?.blobKey || !source.expiresAt || source.expiresAt.getTime() <= Date.now()) return null;
  // Defence in depth: the key must sit under this user's prefix.
  if (!source.blobKey.startsWith(userPrefix(userId))) return null;
  const store = await getFileStore();
  const file = store ? await store.get(source.blobKey) : null;
  return file ? { ...file, name: source.name } : null;
}

/** Deletes a project's originals (called before the project row goes). */
export async function deleteProjectOriginals(projectId: string, userId: string) {
  const store = await getFileStore();
  if (store) await store.deletePrefix(`${userPrefix(userId)}${projectId}/`);
}

export async function removeSource(projectId: string, userId: string, sourceId: string) {
  await ownedProject(projectId, userId);
  const source = await prisma.sourceFile.findFirst({ where: { id: sourceId, projectId }, select: { blobKey: true } });
  if (source?.blobKey?.startsWith(userPrefix(userId))) {
    const store = await getFileStore();
    if (store) await store.deletePrefix(source.blobKey);
  }
  await prisma.sourceFile.deleteMany({ where: { id: sourceId, projectId } });
}
