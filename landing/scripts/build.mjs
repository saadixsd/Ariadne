#!/usr/bin/env node
/*
  site/ -> public/. Wrangler runs this before `wrangler dev` and `wrangler deploy`
  (wrangler.jsonc "build"). Plain string includes, no dependencies:

    {{head}} {{brand}} {{form}} {{foot}} {{door-thread}}   site/partials/*.html
    {{SITE_KEY}} {{SITE_URL}} {{VERSION}}                  landing.config.json + asset hash

  Production gets config.turnstileSiteKey (the real widget). LANDING_DEV=1 (set by `npm run dev`)
  uses config.turnstileSiteKeyDev, Cloudflare's always-pass test key, because the real widget
  refuses localhost. TURNSTILE_SITE_KEY in the environment overrides both (e.g. a failing test key).
*/
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const out = join(root, "public");
const config = JSON.parse(readFileSync(join(root, "landing.config.json"), "utf8"));
const siteKey =
  process.env.TURNSTILE_SITE_KEY ||
  (process.env.LANDING_DEV === "1" ? config.turnstileSiteKeyDev : config.turnstileSiteKey);

const partials = {};
for (const file of readdirSync(join(site, "partials"))) {
  partials[file.replace(/\.(html|svg)$/, "")] = readFileSync(join(site, "partials", file), "utf8").trim();
}
const assetHash = createHash("sha256");
for (const file of ["assets/landing.css", "assets/nojs.css", "assets/early-access.js"]) assetHash.update(readFileSync(join(site, file)));
const version = assetHash.digest("hex").slice(0, 10);

function render(template, page) {
  let html = template;
  for (let pass = 0; pass < 3; pass += 1) {
    html = html.replace(/\{\{([a-z-]+)\}\}/g, (match, name) => partials[name] ?? match);
  }
  const vars = { SITE_KEY: siteKey, SITE_URL: config.siteUrl.replace(/\/$/, ""), VERSION: version };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => vars[name] ?? match);
  const left = html.match(/\{\{[^}]+\}\}/);
  if (left) throw new Error(`unresolved placeholder ${left[0]} in ${page}`);
  return html;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(site, "assets"), join(out, "assets"), { recursive: true });
for (const file of ["favicon.ico", "icon-192.png", "apple-icon.png", "robots.txt", "_headers", "404.html"]) {
  if (existsSync(join(site, file))) cpSync(join(site, file), join(out, file));
}
if (existsSync(join(out, "404.html"))) writeFileSync(join(out, "404.html"), render(readFileSync(join(out, "404.html"), "utf8"), "404"));
writeFileSync(join(out, "index.html"), render(readFileSync(join(site, "pages", "index.html"), "utf8"), "index"));
// the page without its script posts the whole form and lands here
mkdirSync(join(out, "thanks"), { recursive: true });
writeFileSync(join(out, "thanks", "index.html"), render(readFileSync(join(site, "pages", "thanks.html"), "utf8"), "thanks"));
console.log(`landing: built public/ (assets v${version}, turnstile site key ${siteKey.slice(0, 6)}…)`);
