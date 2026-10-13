// Verifies migrations/ against prisma/schema.prisma and a production-like D1.
// Run: node --test tests/integration/migrations.test.mjs   (Node 22, uses node:sqlite)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(path.join(tmpdir(), "ariadne-mig-"));
const sql = (file) => readFileSync(path.join(root, file), "utf8");
const MIGRATIONS = ["migrations/0001_baseline.sql", "migrations/0002_ship_blockers.sql", "migrations/0003_phase2.sql", "migrations/0004_invite_code.sql", "migrations/0005_attribution_feedback.sql", "migrations/0006_workspace.sql", "migrations/0007_r2_workflow_quota.sql", "migrations/0008_r2_budget.sql"];

function schemaDiff(dbFile) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-url", `file:${dbFile}`, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--script"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/^-- This is an empty migration\.\s*$/m, "").trim();
}

function db(name) {
  const file = path.join(dir, name);
  return { file, conn: new DatabaseSync(file) };
}

test("fresh database: 0001 + 0002 == schema.prisma", () => {
  const { file, conn } = db("fresh.db");
  for (const m of MIGRATIONS) conn.exec(sql(m));
  conn.close();
  assert.equal(schemaDiff(file), "");
});

test("prisma/d1.sql (fresh snapshot) == schema.prisma", () => {
  const { file, conn } = db("snapshot.db");
  conn.exec(sql("prisma/d1.sql"));
  conn.close();
  assert.equal(schemaDiff(file), "");
});

test("production-like D1 (old d1.sql + manual name columns): migrations apply, no drift, events backfilled", () => {
  const { file, conn } = db("prod.db");
  conn.exec(sql("tests/integration/fixtures/prod-d1-as-built.sql"));
  conn.exec(`ALTER TABLE "User" ADD COLUMN "firstName" TEXT; ALTER TABLE "User" ADD COLUMN "lastName" TEXT;`);
  // Legacy data written by the old code.
  conn.exec(`
    INSERT INTO "User" (id,email,passwordHash,passwordSalt,emailVerified) VALUES ('u1','a@b.c','h','s',1);
    INSERT INTO "Project" (id,userId,name,brief) VALUES ('p1','u1','P','B');
    INSERT INTO "Agent" (id,projectId,name,provider,model,role) VALUES ('scout','p1','Scout','anthropic','m','r'),('maker','p1','Maker','openai','m','r'),('you','p1','You','human','human','r');
    INSERT INTO "Task" (id,projectId,agentId,title,instructions,status,dependsOn,output) VALUES
      ('t1','p1','scout','Research 100% of "it"_x','i','done','[]','OUT1'),
      ('t2','p1','maker','Draft','i','done','["t1"]','OUT2'),
      ('t3','p1','you','Approve','i','done','["t2"]','PKG');
    INSERT INTO "ActivityEvent" (id,projectId,type,message,taskId) VALUES
      ('e1','p1','handoff','Handoff: Scout handed "Research 100% of "it"_x" to Maker','t2'),
      ('e2','p1','handoff','Handoff: Maker handed "Draft" to You','t3'),
      ('e3','p1','approved','You approved "Approve"','t3'),
      ('e4','p1','handoff','Handoff: Ghost handed "Nope" to Maker','t2'),
      ('e5','p1','completed','Scout completed "x"','t1');
  `);
  for (const m of MIGRATIONS) conn.exec(sql(m));
  const rows = Object.fromEntries(
    conn.prepare(`SELECT id, fromTaskId, toTaskId, runId, payload FROM "ActivityEvent" ORDER BY id`).all().map((r) => [r.id, r]),
  );
  // Re-applying is harmless (0001 is IF NOT EXISTS; backfill only touches NULLs).
  conn.exec(sql(MIGRATIONS[0]));
  const users = conn.prepare(`SELECT count(*) AS n FROM "User"`).get();
  const hands = Object.fromEntries(conn.prepare(`SELECT id, name, role, model FROM "Agent"`).all().map((r) => [r.id, r]));
  conn.close();
  // 0003 renames the hands in place and leaves roles and models alone.
  assert.equal(hands.scout.name, "Odysseus");
  assert.equal(hands.maker.name, "Daedalus");
  assert.equal(hands.you.name, "You");
  assert.equal(hands.scout.role, "r");
  assert.equal(hands.scout.model, "m");

  assert.equal(schemaDiff(file), "", "no drift after migrating a prod-like DB");
  assert.equal(users.n, 1, "data preserved");
  assert.equal(rows.e1.fromTaskId, "t1");
  assert.equal(rows.e1.toTaskId, "t2");
  assert.deepEqual(JSON.parse(rows.e1.payload), { fromAgent: "Scout", toAgent: "Maker", fromTitle: 'Research 100% of "it"_x', toTitle: "Draft" });
  assert.equal(rows.e2.fromTaskId, "t2");
  assert.deepEqual(JSON.parse(rows.e3.payload), { decision: "approved", approver: "You" });
  assert.equal(rows.e4.fromTaskId, null, "unmatched handoff left NULL (UI shows the plain message)");
  assert.equal(rows.e4.payload, null);
  assert.equal(rows.e5.payload, null, "other event types untouched");
});

test("production-like D1 WITHOUT name columns: migrations apply but drift remains -> MIGRATIONS.md pre-step is required", () => {
  const { file, conn } = db("prod-nonames.db");
  conn.exec(sql("tests/integration/fixtures/prod-d1-as-built.sql"));
  for (const m of MIGRATIONS) conn.exec(sql(m));
  conn.close();
  const diff = schemaDiff(file);
  assert.match(diff, /firstName/);
  assert.match(diff, /lastName/);
  assert.doesNotMatch(diff, /TaskRun|RateLimit|fromTaskId/, "0002 itself fully applied");
});
