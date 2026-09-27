import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Workers Builds injects WORKERS_CI=1 and does not run a dashboard build
// command. Pages injects CF_PAGES=1. Local npm installs set neither.
// https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
const onCloudflareCi =
  process.env.WORKERS_CI === "1" || process.env.CF_PAGES === "1";

if (!onCloudflareCi || process.env.ARIADNE_WORKERS_CI_BUILD === "1") {
  process.exit(0);
}

process.env.ARIADNE_WORKERS_CI_BUILD = "1";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function collectInstallers(dir, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return [];
  const found = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === ".bin" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (entry.startsWith("@")) {
      let scoped = [];
      try {
        scoped = readdirSync(full);
      } catch {
        continue;
      }
      for (const name of scoped) {
        found.push(...consider(path.join(full, name), `${entry}/${name}`, depth));
      }
      continue;
    }
    found.push(...consider(full, entry, depth));
  }
  return found;
}

function consider(dir, name, depth) {
  const found = [];
  if (name === "esbuild" || name === "workerd") {
    const script = path.join(dir, "install.js");
    if (existsSync(script)) found.push(script);
  } else if (name === "@prisma/engines") {
    const script = path.join(dir, "scripts", "postinstall.js");
    if (existsSync(script)) found.push(script);
  }
  found.push(...collectInstallers(path.join(dir, "node_modules"), depth + 1));
  return found;
}

const installers = collectInstallers(path.join(root, "node_modules"));
for (const script of installers) {
  console.log(`Running installer skipped by npm allow-scripts: ${path.relative(root, script)}`);
  run([script], path.dirname(script));
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const openNextCli = path.join(
  root,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js",
);
if (!existsSync(prismaCli) || !existsSync(openNextCli)) {
  console.error("Prisma or OpenNext CLI is missing after npm install.");
  process.exit(1);
}

console.log("Generating Prisma Client");
run([prismaCli, "generate"]);

console.log("Building OpenNext for Cloudflare");
run([openNextCli, "build"]);
