#!/usr/bin/env node
/*
  CPU per request for POST and PATCH /api/early-access, measured in-process (Node 22).
  src/worker.ts is bundled with esbuild (as wrangler does) and called directly with a
  D1 stand-in on node:sqlite and a stubbed Turnstile siteverify. Per request we take
  process CPU (user+sys) from start to response, minus CPU spent inside SQLite (D1 is
  I/O on Workers, not Worker CPU). N sequential requests per case, first 5 dropped.
  Static pages never run the Worker (assets.run_worker_first is only /api/*).

    node tests/bench-cpu.mjs        (N=300 by default)
*/
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N = Number(process.env.N || 300);
const outfile = join(tmpdir(), `landing-worker-${process.pid}.mjs`);
await build({ entryPoints: ["src/worker.ts"], bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "error" });
const worker = (await import(outfile)).default;

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("migrations/0001_early_access.sql", "utf8"));
let dbCpu = 0;
const timed = (fn) => { const t = process.cpuUsage(); try { return fn(); } finally { const d = process.cpuUsage(t); dbCpu += (d.user + d.system) / 1000; } };
const DB = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind(...a) { args = a; return stmt; },
      async first() { return timed(() => sqlite.prepare(sql).get(...args) ?? null); },
      async run() { return timed(() => { sqlite.prepare(sql).run(...args); return { success: true }; }); },
    };
    return stmt;
  },
};
const env = { DB, TURNSTILE_SECRET: "x", HASH_SALT: "bench", TOKEN_SECRET: "bench-token-secret", RATE_LIMIT_PER_HOUR: "1000000", ALLOWED_ORIGINS: "https://ariadneagents.si", TURNSTILE_HOSTNAMES: "ariadneagents.si" };
const verifyBody = JSON.stringify({ success: true, hostname: "ariadneagents.si" });
globalThis.fetch = async () => new Response(verifyBody, { headers: { "content-type": "application/json" } });

let ipSeq = 0;
function request(method, body) {
  return new Request("https://ariadneagents.si/api/early-access", {
    method,
    headers: { "content-type": "application/json", origin: "https://ariadneagents.si", "cf-connecting-ip": `203.0.113.${ipSeq++ % 250}`, "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15" },
    body: JSON.stringify(body),
  });
}
const start = { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX", referrer: "https://news.ycombinator.com/item?id=1", utm: { source: "prof", medium: "email" } };
const tokens = [];
const cases = [
  ["step 1: new email (201)", (i) => ["POST", { ...start, email: `bench-${i}@example.com` }], (body) => tokens.push(body.token)],
  ["PATCH answer 1", (i) => ["PATCH", { token: tokens[i], usesAiFor: "Client research reports and landing page copy" }]],
  ["PATCH answer 2", (i) => ["PATCH", { token: tokens[i], tools: ["claude", "gpt", "cursor", "other"], toolsOther: "Perplexity" }]],
  ["PATCH answer 3 + done", (i) => ["PATCH", { token: tokens[i], switching: "several_daily", done: true }]],
  ["step 1: duplicate (200)", () => ["POST", { ...start, email: "bench-0@example.com" }]],
  ["step 1: invalid email (400)", () => ["POST", { ...start, email: "nope" }]],
];

for (const [name, make, after] of cases) {
  const samples = [];
  for (let i = 0; i < N; i += 1) {
    const [method, body] = make(i);
    const req = request(method, body);
    dbCpu = 0;
    const t = process.cpuUsage();
    const res = await worker.fetch(req, env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text();
    const d = process.cpuUsage(t);
    samples.push((d.user + d.system) / 1000 - dbCpu);
    if (after) after(JSON.parse(text));
  }
  const warm = samples.slice(5).sort((a, b) => a - b);
  const q = (p) => warm[Math.min(warm.length - 1, Math.floor(warm.length * p))].toFixed(3);
  console.log(`${name.padEnd(28)} first ${samples[0].toFixed(2)} ms   p50 ${q(0.5)} ms   p90 ${q(0.9)} ms   p99 ${q(0.99)} ms`);
}
