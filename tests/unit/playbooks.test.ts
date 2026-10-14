import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("lib/playbooks.generated.ts matches agents/playbooks (run node scripts/build-playbooks.mjs)", async () => {
  const script = "../../scripts/build-playbooks.mjs";
  const { generated } = (await import(script)) as { generated: string };
  assert.equal(fs.readFileSync("lib/playbooks.generated.ts", "utf8"), generated);
  const { WRITER_PLAYBOOK, CHECKER_PLAYBOOK } = await import("../../lib/playbooks.generated");
  assert.match(WRITER_PLAYBOOK, /Assumption:/);
  assert.match(CHECKER_PLAYBOOK, /sources disagree/);
  assert.doesNotMatch(WRITER_PLAYBOOK + CHECKER_PLAYBOOK, /\b(claude|anthropic|openai|gpt)\b/i);
});
