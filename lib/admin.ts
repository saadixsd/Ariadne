import "server-only";

import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { TaskRunError } from "@/lib/errors";
import { FEEDBACK_RETENTION_DAYS } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

/** Pages: 404 (not 403) for anyone not on ADMIN_EMAILS, so the route does not announce itself. */
export async function requireAdminPage() {
  const user = await currentUser();
  if (!user || !user.emailVerified || !user.isAdmin) notFound();
  return user;
}

export async function requireAdminApi() {
  const user = await currentUser();
  if (!user || !user.emailVerified || !user.isAdmin) throw new TaskRunError("Not found", 404);
  return user;
}

/** Retention: after 12 months feedback keeps its words but loses the person and project. */
export async function anonymiseOldFeedback(now = Date.now()) {
  const cutoff = new Date(now - FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.feedback.updateMany({
    where: { createdAt: { lt: cutoff }, OR: [{ userId: { not: null } }, { projectId: { not: null } }] },
    data: { userId: null, projectId: null, allowProjectView: false },
  });
}

