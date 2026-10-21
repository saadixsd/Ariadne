import "server-only";

import { TaskRunError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  citedUrls,
  htmlToText,
  isFetchableUrl,
  MAX_PAGE_BYTES,
  MAX_PAGE_TEXT_CHARS,
  MAX_PAGES_PER_PROJECT,
  urlKey,
  verifyAgainstPages,
  type SharedPage,
} from "@/lib/pages";

/** Wall time for one page read. Waiting is not CPU; the text extraction is bounded by MAX_PAGE_BYTES. */
const FETCH_TIMEOUT_MS = 9_000;

const toShared = (p: { url: string; status: string; note: string | null; title: string | null; text: string; fetchedAt: Date }): SharedPage => ({
  url: p.url,
  status: p.status === "ok" ? "ok" : "failed",
  note: p.note,
  title: p.title,
  text: p.text,
  fetchedAt: p.fetchedAt.toISOString(),
});

export async function projectPages(projectId: string): Promise<SharedPage[]> {
  const rows = await prisma.fetchedPage.findMany({ where: { projectId }, orderBy: { fetchedAt: "asc" } });
  return rows.map(toShared);
}

/** Status of each page for the UI (no page text: it stays on the server). */
export async function pageStatuses(projectId: string) {
  const rows = await prisma.fetchedPage.findMany({ where: { projectId }, orderBy: { fetchedAt: "asc" }, select: { url: true, status: true, note: true, title: true, fetchedAt: true } });
  return rows.map((r) => ({ url: r.url, status: r.status === "ok" ? ("ok" as const) : ("failed" as const), note: r.note, title: r.title, fetchedAt: r.fetchedAt.toISOString() }));
}

async function readBounded(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_PAGE_BYTES);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(Math.min(size, MAX_PAGE_BYTES));
  let at = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, all.length - at);
    all.set(c.subarray(0, take), at);
    at += take;
    if (at >= all.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

/**
 * Reads one page cited in this project, once. One page per request keeps each request's
 * CPU small (Workers free plan). The URL must appear in one of the project's outputs, so
 * this cannot be used to fetch arbitrary pages.
 */
export async function fetchSharedPage(projectId: string, userId: string, rawUrl: unknown): Promise<SharedPage> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new TaskRunError("Project not found", 404);
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!isFetchableUrl(url)) throw new TaskRunError("Ariadne only reads public web pages", 400);
  const existing = await prisma.fetchedPage.findMany({ where: { projectId } });
  const known = existing.find((p) => urlKey(p.url) === urlKey(url));
  if (known) return toShared(known);
  if (existing.length >= MAX_PAGES_PER_PROJECT) throw new TaskRunError(`Ariadne reads up to ${MAX_PAGES_PER_PROJECT} pages per project`, 409);
  const outputs = await prisma.task.findMany({ where: { projectId }, select: { output: true } });
  const cited = outputs.some((t) => citedUrls(t.output, 60).some((u) => urlKey(u) === urlKey(url)));
  if (!cited) throw new TaskRunError("That link is not cited in this project", 400);

  let status: "ok" | "failed" = "failed";
  let note: string | null = null;
  let title: string | null = null;
  let text = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "AriadneFactCheck/1.0 (+https://ariadne)", Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) note = `the site answered ${res.status}`;
    else if (/pdf|octet-stream|image\/|video\/|audio\//i.test(type)) note = "not a text page (PDF or media)";
    else {
      const body = await readBounded(res);
      if (/json|text\/plain|csv/i.test(type)) text = body.slice(0, MAX_PAGE_TEXT_CHARS);
      else ({ title, text } = htmlToText(body));
      if (text.replace(/\s+/g, "").length < 200) {
        note = "almost no readable text (the page may load its data with JavaScript)";
        text = text.slice(0, 2_000);
        status = text.length > 0 ? "ok" : "failed";
      } else status = "ok";
    }
  } catch (error) {
    note = (error as Error)?.name === "TimeoutError" ? "the page took too long to load" : "the page could not be loaded";
  }
  const row = await prisma.fetchedPage.upsert({
    where: { projectId_url: { projectId, url } },
    create: { projectId, url, status, note, title, text },
    update: {},
  });
  return toShared(row);
}

/** Re-checks a finished fact-check's "supported" verdicts against the pages Ariadne read (B4). */
export async function verifyCheckTask(projectId: string, userId: string, taskId: unknown) {
  if (typeof taskId !== "string") throw new TaskRunError("Expected taskId", 400);
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId, project: { userId }, status: "done" }, select: { id: true, output: true, agent: { select: { provider: true } } } });
  if (!task) throw new TaskRunError("Fact-check not found", 404);
  if (task.agent.provider !== "openai" || !task.output) return { downgraded: 0, confirmed: 0, checked: 0 };
  const pages = await projectPages(projectId);
  const result = verifyAgainstPages(task.output.slice(0, 60_000), pages);
  if (result.downgraded > 0) await prisma.task.update({ where: { id: task.id }, data: { output: result.output } });
  return { downgraded: result.downgraded, confirmed: result.confirmed, checked: result.checked };
}

export { MAX_PAGE_TEXT_CHARS };
