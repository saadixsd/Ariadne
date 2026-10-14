// Runs each brief in evals/briefs.json through Draft → Fact-check on BASE with a signed-in QA
// account, then scores the outputs. Usage: BASE=... EMAIL=... PASSWORD_FILE=... OUT=dir node evals/run-evals.mjs [ids...]
// Scores (1/0 each): answered (no refusal/clarifying question), assumption stated (when the brief is
// ambiguous: quebec-bill96), citations present, no vendor names, checker supported verdicts quoted.
import { chromium } from "playwright";
import fs from "node:fs";
import { parseCritique } from "../lib/critique.ts";

const { BASE, EMAIL, PASSWORD_FILE, OUT = "/tmp/evals", CONCURRENCY = "3", CHROME = "/usr/bin/google-chrome" } = process.env;
const briefs = JSON.parse(fs.readFileSync(new URL("./briefs.json", import.meta.url), "utf8")).filter((b) => process.argv.length < 3 || process.argv.slice(2).includes(b.id));
fs.mkdirSync(OUT, { recursive: true });
const VENDOR = /\b(claude|anthropic|openai|chatgpt|gpt-?\d|gemini|sonnet|haiku)\b/i;
const REFUSAL = /\b(I (can(no|')t|am unable to|don't have) (access|browse|search|provide)|could you (please )?clarify|which do you mean|do you mean|please specify|before I (start|answer|proceed))\b/i;

export function score(brief, draft, check) {
  const flags = parseCritique(check).flags.filter((f) => f.verdict);
  const supported = flags.filter((f) => f.verdict === "supported");
  return {
    answered: draft.length > 400 && !REFUSAL.test(draft.slice(0, 1500)) ? 1 : 0,
    assumption: brief.id !== "quebec-bill96" ? null : /^\s*(\*\*)?assumption/im.test(draft.slice(0, 600)) ? 1 : 0,
    citations: (draft.match(/\]\(https?:\/\//g) ?? []).length >= 3 ? 1 : 0,
    noVendor: VENDOR.test(draft + "\n" + check) ? 0 : 1,
    checkerQuoted: flags.length === 0 ? 0 : supported.every((f) => /["“][^"”]{4,}["”]/.test(f.evidence ?? "")) ? 1 : 0,
    verdicts: flags.reduce((m, f) => ((m[f.verdict] = (m[f.verdict] ?? 0) + 1), m), {}),
  };
}

async function runOne(browser, brief) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const api = (m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch(path, { method: m, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, text: await r.text() }; }, [m, path, body]);
  await p.goto(BASE + "/sign-in");
  const s = await api("POST", "/api/auth/sign-in", { email: EMAIL, password: fs.readFileSync(PASSWORD_FILE, "utf8").trim() });
  if (s.status !== 200) throw new Error(`sign-in ${s.status}`);
  const r = await api("POST", "/api/projects", { name: brief.name, brief: brief.brief });
  const j = JSON.parse(r.text); const id = j.project?.id ?? j.id;
  await p.goto(`${BASE}/p/${id}`); await p.waitForTimeout(2000);
  const click = async (name) => { await p.getByRole("button", { name }).first().click(); await p.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes("can take"), null, { timeout: 400000 }); await p.waitForTimeout(1500); };
  const t0 = Date.now();
  await click(/^Draft · uses/);
  const tDraft = Date.now() - t0;
  await p.screenshot({ path: `${OUT}/${brief.id}-1-draft.png` });
  await click(/^Draft looks right, fact-check it/);
  const tCheck = Date.now() - t0 - tDraft;
  await p.screenshot({ path: `${OUT}/${brief.id}-2-check.png` });
  await p.getByRole("tab", { name: /^Flagged claims/ }).click().catch(() => {}); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${brief.id}-3-flagged.png`, fullPage: true });
  const proj = JSON.parse((await api("GET", `/api/projects/${id}`)).text);
  const P = proj.project ?? proj;
  const prov = new Map(P.agents.map((a) => [a.id, a.provider]));
  const tasks = [...P.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const draftT = tasks.find((t) => prov.get(t.agentId) === "anthropic" && t.dependsOn.length === 0);
  const checkT = tasks.find((t) => prov.get(t.agentId) === "openai" && t.dependsOn.includes(draftT?.id));
  const draft = draftT?.output ?? "", check = checkT?.output ?? "";
  fs.writeFileSync(`${OUT}/${brief.id}.draft.md`, draft); fs.writeFileSync(`${OUT}/${brief.id}.check.md`, check);
  await ctx.close();
  return { id: brief.id, project: id, seconds: { draft: Math.round(tDraft / 1000), check: Math.round(tCheck / 1000) }, ...score(brief, draft, check) };
}

const browser = await chromium.launch({ executablePath: CHROME });
const queue = [...briefs]; const results = [];
await Promise.all(Array.from({ length: Number(CONCURRENCY) }, async () => {
  for (let b; (b = queue.shift()); ) {
    try { const res = await runOne(browser, b); results.push(res); console.log(JSON.stringify(res)); }
    catch (e) { results.push({ id: b.id, error: String(e).slice(0, 300) }); console.log(b.id, "ERROR", String(e).slice(0, 300)); }
  }
}));
await browser.close();
const keys = ["answered", "assumption", "citations", "noVendor", "checkerQuoted"];
const totals = Object.fromEntries(keys.map((k) => { const v = results.map((r) => r[k]).filter((x) => x === 0 || x === 1); return [k, `${v.reduce((a, b) => a + b, 0)}/${v.length}`]; }));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, totals, results }, null, 2));
console.log("TOTALS", JSON.stringify(totals));
